import { isErr } from "@phyxiusjs/fp";
import {
  findRepoRoot,
  lastAttemptByRuntimeName,
  type RuntimeAttempt,
  sharedJournalDirectory,
} from "face";
import { readReplay, sha256 } from "ledger";
import {
  explainLocalConfigRefusal,
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  type LocalConfig,
  loadLocalConfig,
  loadRuntimeCatalogue,
  type MachineAttempt,
  mergeRuntimes,
  type ResolvedRuntime,
  resolveMachine,
} from "runner";
import type { CommandResult } from "../main.ts";
import { IMPLEMENTATION_VERSION, probeConfiguration } from "./probe.ts";

function renderLastAttempt(attempt: RuntimeAttempt | undefined): string {
  if (attempt === undefined) return "last attempt never run";
  const outcome = attempt.outcome === undefined ? "no outcome yet" : attempt.outcome.kind;
  const when =
    attempt.startedAtWallMs === undefined
      ? "time unknown"
      : new Date(attempt.startedAtWallMs).toISOString();
  return `last attempt ${attempt.session} — ${outcome}, ${when}`;
}

function renderRuntime(
  runtime: ResolvedRuntime,
  lastAttempts: ReadonlyMap<string, RuntimeAttempt>,
  probe: string,
): string {
  const model = runtime.model ?? "(none)";
  return (
    `${runtime.name} — kind ${runtime.kind}, model ${model}, source ${runtime.source}, ` +
    renderLastAttempt(lastAttempts.get(runtime.name)) +
    `, ${probe}`
  );
}

function latestProbes(
  probes: ReadonlyMap<string, import("ledger").ProbeEvent>,
): ReadonlyMap<string, import("ledger").ProbeEvent> {
  const latest = new Map<string, import("ledger").ProbeEvent>();
  for (const probe of probes.values()) {
    const current = latest.get(probe.profile);
    if (current === undefined || current.at < probe.at) latest.set(probe.profile, probe);
  }
  return latest;
}

function probeLine(
  runtime: ResolvedRuntime,
  probe: import("ledger").ProbeEvent | undefined,
  machine: MachineAttempt | undefined,
): string {
  if (probe === undefined) return "last probe never probed";
  if (machine === undefined)
    return `last probe environment unknown, artifact ${probe.configuration}`;
  const current = sha256(`${JSON.stringify(probeConfiguration(runtime, machine))}\n`);
  const state =
    probe.configuration === current && probe.implementationVersion === IMPLEMENTATION_VERSION
      ? probe.checks.every((check) => check.state === "passed")
        ? "passed"
        : "did not pass"
      : `historical (probed under an earlier configuration), artifact ${probe.configuration}`;
  return `last probe ${state}, ${new Date(probe.at).toISOString()}`;
}

export async function runRuntimeList(
  _args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const catalogue = await loadRuntimeCatalogue();
  if (isErr(catalogue)) {
    return {
      exitCode: 1,
      message: explainRuntimeCatalogueRefusal(catalogue.error),
    };
  }

  const localResult = await loadLocalConfig(repoRoot);
  let local: LocalConfig | undefined;
  let localAbsent = false;
  if (isErr(localResult)) {
    if (localResult.error.kind !== "missing") {
      return {
        exitCode: 1,
        message: explainLocalConfigRefusal(localResult.error),
      };
    }
    localAbsent = true;
  } else {
    local = localResult.value;
  }

  const merged = mergeRuntimes(catalogue.value, local);
  if (isErr(merged)) {
    return { exitCode: 1, message: explainMergeRuntimesRefusal(merged.error) };
  }

  const runtimes = [...merged.value.runtimes.values()];
  if (runtimes.length === 0) {
    const localDescription = localAbsent
      ? "local.yaml is absent"
      : "local.yaml has no runtime block";
    return {
      exitCode: 0,
      message: `no runtimes declared; the catalogue is empty and ${localDescription}.`,
    };
  }

  const journal = await sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
    };
  }
  const lastAttempts = lastAttemptByRuntimeName(replayed.value);
  const probes = latestProbes(replayed.value.probes);
  let machine: MachineAttempt | undefined;
  if (probes.size > 0) {
    const resolved = await resolveMachine(repoRoot);
    if (isErr(resolved)) machine = undefined;
    else machine = resolved.value;
  }

  return {
    exitCode: 0,
    message: runtimes
      .map((runtime) =>
        renderRuntime(runtime, lastAttempts, probeLine(runtime, probes.get(runtime.name), machine)),
      )
      .join("\n"),
  };
}
