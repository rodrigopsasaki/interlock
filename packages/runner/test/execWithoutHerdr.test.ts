import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { type Clock, createControlledClock } from "@phyxiusjs/clock";
import { err, ok } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import type { Ledger } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { execRunRoot, listExecSessions } from "../src/execRuntime.ts";
import type { Runtime } from "../src/runtime.ts";
import { execRuntimeArgv, type ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { sweepExpiredLeases } from "../src/sweep.ts";
import {
  driveOnce,
  fixtureRepository,
  legacyLocalYaml,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;
let homeDirectory: string | undefined;
const savedHome = process.env["HOME"];
const savedXdgConfigHome = process.env["XDG_CONFIG_HOME"];
const savedMachine = process.env["INTERLOCK_MACHINE"];
const savedPath = process.env["PATH"] ?? "";
const savedGitConfigGlobal = process.env["GIT_CONFIG_GLOBAL"];
const savedGitConfigNoSystem = process.env["GIT_CONFIG_NOSYSTEM"];
const savedGitAuthorName = process.env["GIT_AUTHOR_NAME"];
const savedGitAuthorEmail = process.env["GIT_AUTHOR_EMAIL"];
const savedGitCommitterName = process.env["GIT_COMMITTER_NAME"];
const savedGitCommitterEmail = process.env["GIT_COMMITTER_EMAIL"];

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (homeDirectory !== undefined) rmSync(homeDirectory, { recursive: true, force: true });
  homeDirectory = undefined;
  if (savedHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = savedHome;
  if (savedXdgConfigHome === undefined) delete process.env["XDG_CONFIG_HOME"];
  else process.env["XDG_CONFIG_HOME"] = savedXdgConfigHome;
  if (savedMachine === undefined) delete process.env["INTERLOCK_MACHINE"];
  else process.env["INTERLOCK_MACHINE"] = savedMachine;
  if (savedGitConfigGlobal === undefined) delete process.env["GIT_CONFIG_GLOBAL"];
  else process.env["GIT_CONFIG_GLOBAL"] = savedGitConfigGlobal;
  if (savedGitConfigNoSystem === undefined) delete process.env["GIT_CONFIG_NOSYSTEM"];
  else process.env["GIT_CONFIG_NOSYSTEM"] = savedGitConfigNoSystem;
  if (savedGitAuthorName === undefined) delete process.env["GIT_AUTHOR_NAME"];
  else process.env["GIT_AUTHOR_NAME"] = savedGitAuthorName;
  if (savedGitAuthorEmail === undefined) delete process.env["GIT_AUTHOR_EMAIL"];
  else process.env["GIT_AUTHOR_EMAIL"] = savedGitAuthorEmail;
  if (savedGitCommitterName === undefined) delete process.env["GIT_COMMITTER_NAME"];
  else process.env["GIT_COMMITTER_NAME"] = savedGitCommitterName;
  if (savedGitCommitterEmail === undefined) delete process.env["GIT_COMMITTER_EMAIL"];
  else process.env["GIT_COMMITTER_EMAIL"] = savedGitCommitterEmail;
  process.env["PATH"] = savedPath;
});

function executable(name: string, pathValue: string): string | undefined {
  for (const directory of pathValue.split(":")) {
    if (directory.length === 0) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

function herdrFreeEnvironment(): void {
  homeDirectory = mkdtempSync(join(tmpdir(), "interlock-runner-exec-home-"));
  const bin = join(homeDirectory, "bin");
  mkdirSync(bin);
  for (const name of ["git", "sh", "ps"]) {
    const source = executable(name, savedPath);
    if (source === undefined || source.startsWith(homedir())) {
      throw new Error(`fixture PATH lacks safe ${name}`);
    }
    symlinkSync(source, join(bin, name));
  }
  const mise = join(bin, "mise");
  writeFileSync(mise, '#!/bin/sh\nexec "$@"\n');
  chmodSync(mise, 0o755);
  const configHome = join(homeDirectory, "config");
  mkdirSync(join(configHome, "interlock"), { recursive: true });
  const machine = join(configHome, "interlock", "machine.yaml");
  writeFileSync(machine, "interlock: machine@v0\nprovider: none\n");
  process.env["HOME"] = homeDirectory;
  process.env["XDG_CONFIG_HOME"] = configHome;
  process.env["INTERLOCK_MACHINE"] = machine;
  process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  process.env["GIT_AUTHOR_NAME"] = "fixture";
  process.env["GIT_AUTHOR_EMAIL"] = "fixture@example.invalid";
  process.env["GIT_COMMITTER_NAME"] = "fixture";
  process.env["GIT_COMMITTER_EMAIL"] = "fixture@example.invalid";
  process.env["PATH"] = bin;
  expect(executable("herdr", process.env["PATH"])).toBeUndefined();
  expect(existsSync(join(homeDirectory, ".herdr", "herdr.sock"))).toBe(false);
}

const runtime: Pick<
  ResolvedRuntime,
  "args" | "readOnlyArgs" | "mcpServers" | "mcpAllow" | "mcpDisableArgs"
> = {
  args: ["fixture-agent", "--prompt", "{prompt}"],
  readOnlyArgs: [],
  mcpServers: [],
  mcpAllow: [],
  mcpDisableArgs: [],
};

describe("exec launch prompt delivery", () => {
  it("expands a phase prompt at the phase boundary", () => {
    const work = execRuntimeArgv(runtime, "work prompt");
    const debrief = execRuntimeArgv(runtime, "debrief prompt");

    expect(work).toEqual(["fixture-agent", "--prompt", "work prompt"]);
    expect(debrief).toEqual(["fixture-agent", "--prompt", "debrief prompt"]);
  });
});

it("drives exec phases without injected herdr preflight and records done zero phases", async () => {
  directory = mkdtempSync(join(runsRoot, "exec-without-herdr-drive-"));
  const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: claude", "args: []"]));
  writeFileSync(join(repoRoot, ".gitignore"), "interlock/\n");
  fixtureGit(["add", ".gitignore"], { cwd: repoRoot });
  fixtureGit(["commit", "-m", "ignore fixture runtime artifacts"], { cwd: repoRoot });
  const catalogue = join(repoRoot, "runtimes.yaml");
  writeFileSync(
    catalogue,
    [
      "interlock: runtimes@v2",
      "runtimes:",
      "  fixture:",
      "    kind: exec",
      "    commits: agent",
      `    args: [${JSON.stringify(process.execPath)}, "-e", "process.exit(0)", "{prompt}"]`,
      "    model: fixture",
      "",
    ].join("\n"),
  );
  const selected = await selectedRuntime(repoRoot, catalogue, "fixture");
  const calls: string[] = [];
  const base = recordingRuntime().runtime;
  const injected: Runtime = {
    ...base,
    checkServer: () => {
      calls.push("checkServer");
      return Promise.resolve(err({ kind: "not-ready", message: "injected herdr failure" }));
    },
  };
  herdrFreeEnvironment();

  const driven = await driveOnce(
    repoRoot,
    "a",
    selected.localConfig,
    selected.agentRuntime,
    injected,
  );

  expect(driven.outcome.exitCode).toBe(0);
  expect(calls).toEqual([]);
  const journal = await sharedJournalDirectory(repoRoot);
  const sessions = await listExecSessions(execRunRoot(dirname(dirname(journal))));
  const phases = sessions.filter((session) => session.graph === "g" && session.node === "a");
  expect(phases.map((phase) => phase.phaseId).sort()).toEqual(["debrief", "work"]);
  for (const phase of phases) {
    expect(phase.state).toBe("done");
    expect(phase.exitCode).toBe(0);
  }
});

it.each(["exec", "pane"] as const)(
  "renews the lease through a busy judgement on the %s path and sweeps nothing",
  async (kind) => {
    directory = mkdtempSync(join(runsRoot, `busy-lease-${kind}-`));
    const repoRoot = fixtureRepository(directory, legacyLocalYaml([`kind: ${kind}`, "args: []"]));
    writeFileSync(join(repoRoot, ".gitignore"), "interlock/\n");
    fixtureGit(["add", ".gitignore"], { cwd: repoRoot });
    fixtureGit(["commit", "-m", "ignore fixture runtime artifacts"], { cwd: repoRoot });
    const catalogue = join(repoRoot, "runtimes.yaml");
    writeFileSync(
      catalogue,
      [
        "interlock: runtimes@v2",
        "runtimes:",
        "  fixture:",
        `    kind: ${kind}`,
        "    commits: agent",
        `    args: [${kind === "exec" ? `${JSON.stringify(process.execPath)}, "-e", "process.exit(0)", "{prompt}"` : ""}]`,
        "    model: fixture",
        "",
      ].join("\n"),
    );
    const selected = await selectedRuntime(repoRoot, catalogue, "fixture");
    herdrFreeEnvironment();

    let paneWorktree = "";
    let promptCount = 0;
    const paneRuntime: Runtime = {
      paneEnvironment: true,
      openPane: (cwd) => {
        paneWorktree = cwd;
        return Promise.resolve(ok({ id: "pane", workspace: "workspace" }));
      },
      paneProcess: () => Promise.resolve(ok({ state: "present", pid: 1234 })),
      startAgent: (pane) => Promise.resolve(ok({ id: "agent", pane })),
      reportIdentity: () => Promise.resolve(ok(undefined)),
      prompt: async () => {
        promptCount += 1;
        if (kind === "pane" && promptCount === 1) {
          const debrief = join(paneWorktree, ".interlock/sessions/g/n/debrief.yaml");
          mkdirSync(dirname(debrief), { recursive: true });
          writeFileSync(debrief, "interlock: debrief@v1\n");
          fixtureGit(["add", debrief], { cwd: paneWorktree });
          fixtureGit(["commit", "-m", "fixture debrief"], { cwd: paneWorktree });
        }
        return ok(undefined);
      },
      waitUntil: async (_agent, until) => {
        if (until.includes("idle") && until.includes("blocked") && !until.includes("done")) {
          return ok("idle");
        }
        return ok("done");
      },
      read: () => Promise.resolve(ok("")),
      sendKeys: () => Promise.resolve(ok(undefined)),
      sendPaneKeys: () => Promise.resolve(ok(undefined)),
      closePane: () => Promise.resolve(ok(undefined)),
      observe: () =>
        Promise.resolve(
          ok({
            attempt: () => ({
              agentStatus: "idle",
              pane: { state: "known", address: "pane" },
              liveWork: () => Promise.resolve({ state: "none" }),
            }),
          }),
        ),
    };
    const machine = {
      provider: {
        admit: [process.execPath, "-e", "process.exit(0)"],
        bind: [process.execPath, "-e", "process.exit(0)"],
        release: [process.execPath, "-e", "process.exit(0)"],
        env: [process.execPath, "-e", "process.exit(0)"],
        heavy: [],
        busy: { exitCode: 75, attempts: 4, firstBackoffMs: 40, maxBackoffMs: 40 },
      },
      env: {},
      heavy: [],
    } as const;
    const controlled = createControlledClock({ initialTime: 0 });
    let ledger: Ledger | undefined;
    const sweeps: string[][] = [];
    const clock: Clock = {
      now: () => controlled.now(),
      sleep: async (duration) => {
        controlled.advanceBy(duration);
        if (ledger !== undefined)
          sweeps.push([...sweepExpiredLeases(ledger, controlled.now().wallMs)]);
      },
      timeout: (duration) => controlled.timeout(duration),
      deadline: (target) => controlled.deadline(target),
      interval: (duration, callback) => controlled.interval(duration, callback),
    };
    let starts = 0;
    const localConfig = { ...selected.localConfig, leaseMs: 30, runTimeoutMs: 5000 };
    const driven = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      selected.agentRuntime,
      kind === "pane" ? paneRuntime : recordingRuntime().runtime,
      clock,
      {
        machine,
        nodeGates: [{ id: "busy-gate", kind: "command", run: "fixture" }],
        ledgerDirectory: join(runsRoot, `busy-lease-${kind}-ledger`),
        onLedger: (value) => {
          ledger = value;
        },
        commandRunner: async (_argv, _cwd, env) => {
          starts += 1;
          if (starts < 4) {
            writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "lease busy\n");
            return { exitCode: 75, output: "", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
          }
          writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
          return { exitCode: 0, output: "", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
        },
      },
    );
    expect(driven.outcome.exitCode, driven.outcome.message).toBe(0);
    expect(starts).toBe(4);
    expect(sweeps).toEqual([[], [], []]);
    const renewals = driven.events.flatMap((event, index) =>
      event.kind === "lease-renewed" ? [index] : [],
    );
    const outcomes = driven.events.flatMap((event, index) =>
      event.kind === "outcome-set" ? [index] : [],
    );
    expect(renewals.length).toBeGreaterThan(2);
    expect(renewals.at(-1)).toBeLessThan(outcomes.at(-1) ?? -1);
  },
);
