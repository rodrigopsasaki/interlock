import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { currentCommitSha, findRepoRoot, sharedJournalDirectory } from "face";
import {
  createLedger,
  derivation,
  type ProbeConfig,
  readProbeConfig,
  retainProbeConfig,
  sha256,
} from "ledger";
import {
  admitMachine,
  explainLocalConfigRefusal,
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  loadLocalConfig,
  loadRuntimeCatalogue,
  type MachineAttempt,
  type MachineHold,
  machineDelivery,
  machineIntent,
  mergeRuntimes,
  type ProbeExecutor,
  type ProbeProcessRunner,
  prepareLaunch,
  probePassed,
  providerArgv,
  type ResolvedRuntime,
  resolveMachine,
  runProbeChecks,
  runProviderCommand,
} from "runner";
import type { CommandResult } from "../main.ts";

const IMPLEMENTATION_VERSION = "runtime-probe@v1";

export interface RuntimeProbeOptions {
  readonly cwd?: string;
  readonly machine?: MachineAttempt;
  readonly processRunner?: ProbeProcessRunner;
  readonly adapter?: ProbeExecutor;
  readonly adapterFor?: (kind: string) => ProbeExecutor | undefined;
  readonly runnerSignedCommit?: () => Promise<
    import("@phyxiusjs/fp").Result<string | undefined, string>
  >;
}

export function probeConfiguration(runtime: ResolvedRuntime, machine: MachineAttempt): ProbeConfig {
  const profile: Record<string, string> = {};
  for (const [key, value] of Object.entries(runtime)) {
    const serialized = JSON.stringify(value);
    profile[key] = sha256(serialized === undefined ? "undefined" : serialized);
  }
  return {
    interlock: "probe-config@v0",
    profile,
    provider: { value: sha256(JSON.stringify(machine.provider)) },
    environment: { value: sha256(JSON.stringify(machine.env)) },
  };
}

function addProbeWorktree(repoRoot: string, path: string, branch: string, head: string): void {
  execFileSync("git", ["worktree", "add", "-b", branch, path, head], {
    cwd: repoRoot,
    stdio: ["ignore", "ignore", "ignore"],
  });
}

function removeProbeWorktree(repoRoot: string, path: string, branch: string): void {
  try {
    execFileSync("git", ["worktree", "remove", "--force", path], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });
  } finally {
    try {
      execFileSync("git", ["branch", "-D", branch], {
        cwd: repoRoot,
        stdio: ["ignore", "ignore", "ignore"],
      });
    } catch {}
  }
}

async function signRunnerCommit(
  path: string,
): Promise<import("@phyxiusjs/fp").Result<string | undefined, string>> {
  try {
    execFileSync("git", ["commit", "--allow-empty", "-S", "-m", "interlock runtime probe"], {
      cwd: path,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const fingerprint = execFileSync("git", ["log", "-1", "--format=%GF"], {
      cwd: path,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return ok(fingerprint.length === 0 ? undefined : fingerprint);
  } catch (error) {
    return err(error instanceof Error ? error.message : "runner signing refused");
  }
}

function renderResults(
  profile: string,
  results: Awaited<ReturnType<typeof runProbeChecks>>,
): string {
  return results
    .map((result) => {
      const detail =
        result.state === "passed"
          ? `passed${result.fingerprint === undefined ? "" : ` (fingerprint ${result.fingerprint})`}`
          : result.state === "refused"
            ? `refused: ${result.error}`
            : `unavailable: ${result.reason}`;
      return `${profile} ${result.check}: ${detail}`;
    })
    .join("\n");
}

function renderJson(profile: string, results: Awaited<ReturnType<typeof runProbeChecks>>): string {
  return JSON.stringify({ profile, checks: results });
}

async function probeOne(
  repoRoot: string,
  profile: string,
  runtime: ResolvedRuntime,
  machine: MachineAttempt,
  options: RuntimeProbeOptions,
  json: boolean,
): Promise<CommandResult> {
  const journalDirectory = await sharedJournalDirectory(repoRoot);
  const ledgerResult = await createLedger({
    clock: createSystemClock(),
    directory: journalDirectory,
  });
  if (isErr(ledgerResult)) return { exitCode: 1, message: "probe ledger cannot be opened" };
  const ledger = ledgerResult.value;
  const probeId = randomUUID();
  const node = { graph: "runtime-probe", id: profile };
  const config = retainProbeConfig(journalDirectory, probeConfiguration(runtime, machine));
  if (isErr(config)) return { exitCode: 1, message: config.error };
  const head = await currentCommitSha(repoRoot);
  const branch = `interlock/probe/${profile}-${probeId.slice(0, 8)}`;
  const path = join(repoRoot, ".interlock", "probe-runs", `${profile}-${probeId}`);
  mkdirSync(join(repoRoot, ".interlock", "probe-runs"), { recursive: true });
  let results: Awaited<ReturnType<typeof runProbeChecks>> = [];
  try {
    addProbeWorktree(repoRoot, path, branch, head);
    const launch = prepareLaunch(runtime, path, machine.env);
    if (isErr(launch))
      return { exitCode: 1, message: `probe launch refused: ${launch.error.kind}` };
    let admissionReason: string | undefined;
    let releaseHold: MachineHold | undefined;
    if (machine.provider !== "none") {
      const values = {
        holder: `runtime probe ${profile}`,
        token: probeId,
        pid: "",
        pane: `probe-${probeId}`,
        workspace: path,
        agent: runtime.name,
        worktree: path,
        attempt: probeId,
      };
      const hold = {
        token: probeId,
        pane: `probe-${probeId}`,
        cwd: path,
        release: providerArgv(machine.provider.release, values),
        env: machine.env,
      };
      const admitted = await admitMachine(
        ledger,
        node,
        probeId,
        hold,
        providerArgv(machine.provider.admit, values),
      );
      if (isErr(admitted)) admissionReason = admitted.error;
      if (admissionReason === undefined) releaseHold = hold;
    }
    if (admissionReason !== undefined) {
      results = [
        { check: "shm", state: "unavailable", reason: admissionReason },
        { check: "loopback", state: "unavailable", reason: admissionReason },
        { check: "worktree-file", state: "unavailable", reason: admissionReason },
        { check: "git-metadata", state: "unavailable", reason: admissionReason },
        { check: "signed-commit", state: "unavailable", reason: admissionReason },
      ];
    } else {
      const adapter = options.adapter ?? options.adapterFor?.(runtime.kind);
      results = await runProbeChecks({
        runtime,
        launch: launch.value,
        ...(options.processRunner === undefined ? {} : { processRunner: options.processRunner }),
        ...(adapter === undefined ? {} : { adapter }),
        ...((options.runnerSignedCommit ??
          (runtime.commits === "runner" ? () => signRunnerCommit(path) : undefined)) === undefined
          ? {}
          : {
              runnerSignedCommit: options.runnerSignedCommit ?? (() => signRunnerCommit(path)),
            }),
      });
    }
    if (releaseHold !== undefined) {
      const releaseIntent = machineIntent(ledger, node, probeId, "release", releaseHold);
      if (!isErr(releaseIntent)) {
        const released = await runProviderCommand(releaseHold.release, releaseHold.cwd, {
          ...process.env,
          ...releaseHold.env,
        });
        machineDelivery(
          ledger,
          releaseIntent.value,
          released.code === 0 ? ok(released) : err(released.output),
        );
      }
    }
    const signedCommit = results.find((result) => result.check === "signed-commit");
    const signedCommitKeyFingerprint =
      signedCommit?.state === "passed" ? signedCommit.fingerprint : undefined;
    ledger.append({
      kind: "probe",
      probeId,
      profile,
      configuration: config.value.sha256,
      implementationVersion: IMPLEMENTATION_VERSION,
      checks: results,
      ...(signedCommitKeyFingerprint === undefined ? {} : { signedCommitKeyFingerprint }),
      derivation: derivation.gate("runtime-probe", IMPLEMENTATION_VERSION, "runner"),
      at: Date.now(),
    });
  } catch (error) {
    return { exitCode: 1, message: error instanceof Error ? error.message : String(error) };
  } finally {
    removeProbeWorktree(repoRoot, path, branch);
    await ledger.close();
  }
  const message = json ? renderJson(profile, results) : renderResults(profile, results);
  return { exitCode: probePassed(results) ? 0 : 1, message };
}

export async function runRuntimeProbe(
  args: readonly string[],
  options: RuntimeProbeOptions = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return { exitCode: 1, message: `${cwd}: no .interlock directory found.` };
  }
  const catalogue = await loadRuntimeCatalogue();
  if (isErr(catalogue))
    return { exitCode: 1, message: explainRuntimeCatalogueRefusal(catalogue.error) };
  const localResult = await loadLocalConfig(repoRoot);
  const local = isErr(localResult)
    ? localResult.error.kind === "missing"
      ? undefined
      : undefined
    : localResult.value;
  if (isErr(localResult) && localResult.error.kind !== "missing") {
    return { exitCode: 1, message: explainLocalConfigRefusal(localResult.error) };
  }
  const merged = mergeRuntimes(catalogue.value, local);
  if (isErr(merged)) return { exitCode: 1, message: explainMergeRuntimesRefusal(merged.error) };
  if (args[0] === "show") {
    const journal = await sharedJournalDirectory(repoRoot);
    const fingerprint = args[1];
    if (fingerprint === undefined)
      return { exitCode: 1, message: "runtime probe show needs a fingerprint." };
    const config = readProbeConfig(journal, fingerprint);
    return isErr(config)
      ? { exitCode: 1, message: config.error }
      : { exitCode: 0, message: config.value };
  }
  const all = args.includes("--all");
  const json = args.includes("--json");
  const requested = args[0];
  if (!all && requested === undefined) {
    return { exitCode: 1, message: "no runtimes declared; cannot probe an empty catalogue." };
  }
  const names = all
    ? [...merged.value.runtimes.keys()]
    : requested === undefined
      ? []
      : [requested];
  if (names.length === 0)
    return { exitCode: 1, message: "no runtimes declared; cannot probe an empty catalogue." };
  const resolvedMachine =
    options.machine === undefined ? await resolveMachine(repoRoot) : ok(options.machine);
  if (isErr(resolvedMachine)) return { exitCode: 1, message: resolvedMachine.error };
  const results: CommandResult[] = [];
  for (const name of names) {
    const runtime = merged.value.runtimes.get(name);
    if (runtime === undefined) {
      results.push({ exitCode: 1, message: `"${name}" is not a known runtime.` });
      continue;
    }
    results.push(await probeOne(repoRoot, name, runtime, resolvedMachine.value, options, json));
  }
  const message = results.map((result) => result.message).join("\n");
  return { exitCode: results.every((result) => result.exitCode === 0) ? 0 : 1, message };
}
