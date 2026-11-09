import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, isErr } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, heldOn, type Ledger, outcome } from "ledger";
import type { MachineHold, Runtime } from "runner";
import { execRunRoot, listExecSessions, machineIntent } from "runner";
import { afterEach, expect, it } from "vitest";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockJudge } from "../src/judge.ts";
import { runInterlockRun } from "../src/run.ts";
import { runSessions } from "../src/sessions.ts";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";
import { slowIntegration } from "./support/slowIntegration.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let promptRecordPath: string | undefined;
let homeDirectory: string | undefined;
const savedRuntimes = process.env["INTERLOCK_RUNTIMES"];
const savedPromptRecord = process.env["INTERLOCK_EXEC_PROMPTS"];
const savedBarrier = process.env["INTERLOCK_EXEC_BARRIER"];
const savedHome = process.env["HOME"];
const savedXdgConfigHome = process.env["XDG_CONFIG_HOME"];
const savedMachine = process.env["INTERLOCK_MACHINE"];
const savedGitConfigGlobal = process.env["GIT_CONFIG_GLOBAL"];
const savedGitConfigNoSystem = process.env["GIT_CONFIG_NOSYSTEM"];
const savedGitAuthorName = process.env["GIT_AUTHOR_NAME"];
const savedGitAuthorEmail = process.env["GIT_AUTHOR_EMAIL"];
const savedGitCommitterName = process.env["GIT_COMMITTER_NAME"];
const savedGitCommitterEmail = process.env["GIT_COMMITTER_EMAIL"];
const savedPath = process.env["PATH"] ?? "";

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (promptRecordPath !== undefined) rmSync(promptRecordPath, { force: true });
  promptRecordPath = undefined;
  if (homeDirectory !== undefined) rmSync(homeDirectory, { recursive: true, force: true });
  homeDirectory = undefined;
  if (savedRuntimes === undefined) delete process.env["INTERLOCK_RUNTIMES"];
  else process.env["INTERLOCK_RUNTIMES"] = savedRuntimes;
  if (savedPromptRecord === undefined) delete process.env["INTERLOCK_EXEC_PROMPTS"];
  else process.env["INTERLOCK_EXEC_PROMPTS"] = savedPromptRecord;
  if (savedBarrier === undefined) delete process.env["INTERLOCK_EXEC_BARRIER"];
  else process.env["INTERLOCK_EXEC_BARRIER"] = savedBarrier;
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

const graph = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    acceptance: a fixture exec node",
  "    gates: []",
  "",
].join("\n");

const config = ["interlock: config@v0", "standing_gates: []", ""].join("\n");

const local = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 60000",
  "run_timeout_ms: 5000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

const brief = [
  "---",
  "interlock: brief@v1",
  "graph: demo",
  "node: a",
  "role: implementer",
  "gates: []",
  "scope:",
  "  - .interlock/config.yaml",
  "  - .interlock/graphs/demo.yaml",
  "  - .interlock/local.yaml",
  "  - .interlock/sessions/demo/a/brief.md",
  "substrate:",
  "  address: none",
  "---",
  "",
  "# brief",
  "",
  "## Acceptance (verbatim from the graph)",
  "",
  "> a fixture exec node",
  "",
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "exec-without-herdr-"));
  const session = join(directory, ".interlock", "sessions", "demo", "a");
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(session, { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graph);
  writeFileSync(join(directory, ".interlock", "config.yaml"), config);
  writeFileSync(join(directory, ".interlock", "local.yaml"), local);
  writeFileSync(join(directory, ".gitignore"), "interlock/\n");
  writeFileSync(join(session, "brief.md"), brief);
  gitInitFixture(directory);
  commitAll(directory, "fixture repository");
  return directory;
}

function execCatalogue(program: string, script: string): string {
  return [
    "interlock: runtimes@v2",
    "runtimes:",
    "  fixture:",
    "    kind: exec",
    "    commits: agent",
    `    args: [${JSON.stringify(program)}, ${JSON.stringify(script)}, "{prompt}"]`,
    "    model: fixture",
    "",
  ].join("\n");
}

function stdinExecCatalogue(program: string, script: string): string {
  return [
    "interlock: runtimes@v2",
    "runtimes:",
    "  fixture:",
    "    kind: exec",
    "    commits: agent",
    `    args: [${JSON.stringify(program)}, ${JSON.stringify(script)}]`,
    "    model: fixture",
    "    prompt: stdin",
    "",
  ].join("\n");
}

function paneCatalogue(): string {
  return [
    "interlock: runtimes@v2",
    "runtimes:",
    "  pane:",
    "    kind: claude",
    "    commits: agent",
    "    args: []",
    "    model: fixture",
    "",
  ].join("\n");
}

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

function hasHerdrSocket(root: string): boolean {
  const entries = readdirSync(root, { withFileTypes: true });
  return entries.some((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? hasHerdrSocket(path) : entry.name === "herdr.sock";
  });
}

function herdrFreeEnvironment(): void {
  homeDirectory = mkdtempSync(join(tmpdir(), "interlock-exec-home-"));
  const bin = join(homeDirectory, "bin");
  mkdirSync(bin);
  for (const name of ["git", "sh", "ps"]) {
    const source = executable(name, savedPath);
    if (source === undefined || source.startsWith(homedir())) {
      throw new Error(`fixture PATH cannot provide ${name} outside the owner home`);
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
  expect(hasHerdrSocket(homeDirectory)).toBe(false);
}

async function assertDoneExecPhases(cwd: string): Promise<void> {
  const journal = await sharedJournalDirectory(cwd);
  const sessions = await listExecSessions(execRunRoot(dirname(dirname(journal))));
  const phases = sessions.filter((session) => session.graph === "demo" && session.node === "a");
  expect(phases.map((phase) => phase.phaseId).sort()).toEqual(["debrief", "work"]);
  for (const phase of phases) {
    expect(phase.state).toBe("done");
    expect(phase.exitCode).toBe(0);
  }
}

function sessionIdFromLedger(ledger: Ledger): string {
  const sessions = [...ledger.projection().sessions.values()].filter(
    (session) => session.node.graph === "demo" && session.node.id === "a",
  );
  const latest = sessions[sessions.length - 1];
  if (latest === undefined) throw new Error("expected a recorded exec session");
  return latest.session;
}

slowIntegration(
  "runs both exec phases without herdr and gives each phase its own argv prompt",
  {
    budgetMs: 15_000,
    reason: "integrates both real exec phases, child argv prompts and session completion",
  },
  async () => {
    const cwd = fixture();
    const script = join(cwd, "record-prompts.mjs");
    const record = join(runsRoot, `prompts-${process.pid}.txt`);
    promptRecordPath = record;
    writeFileSync(
      script,
      [
        'import { appendFileSync } from "node:fs";',
        'appendFileSync(process.env.INTERLOCK_EXEC_PROMPTS, JSON.stringify(process.argv.at(-1)) + "\\n");',
        "",
      ].join("\n"),
    );
    const catalogue = join(cwd, "runtimes.yaml");
    writeFileSync(catalogue, execCatalogue(process.execPath, script));
    commitAll(cwd, "add exec fixture");
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    process.env["INTERLOCK_EXEC_PROMPTS"] = record;
    await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
    herdrFreeEnvironment();

    const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], { cwd });

    expect(result.exitCode).toBe(0);
    await assertDoneExecPhases(cwd);
    expect(existsSync(record)).toBe(true);
    const prompts = readFileSync(record, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).not.toBe(prompts[1]);
    expect(prompts[0]).toContain("fixture exec node");
    expect(prompts[1]).toContain("File your debrief");
  },
);

slowIntegration(
  "runs both exec phases with their own stdin prompt",
  {
    budgetMs: 15_000,
    reason: "integrates both real exec phases, child stdin prompts and session completion",
  },
  async () => {
    const cwd = fixture();
    const script = join(cwd, "record-stdin.mjs");
    const record = join(runsRoot, `stdin-prompts-${process.pid}.txt`);
    promptRecordPath = record;
    writeFileSync(
      script,
      [
        'import { appendFileSync } from "node:fs";',
        'let prompt = "";',
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", (chunk) => { prompt += chunk; });',
        'process.stdin.on("end", () => appendFileSync(process.env.INTERLOCK_EXEC_PROMPTS, JSON.stringify(prompt) + "\\n"));',
        "",
      ].join("\n"),
    );
    const catalogue = join(cwd, "runtimes.yaml");
    writeFileSync(catalogue, stdinExecCatalogue(process.execPath, script));
    commitAll(cwd, "add stdin exec fixture");
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    process.env["INTERLOCK_EXEC_PROMPTS"] = record;
    await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
    herdrFreeEnvironment();

    const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], { cwd });

    expect(result.exitCode).toBe(0);
    await assertDoneExecPhases(cwd);
    const prompts = readFileSync(record, "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(prompts).toHaveLength(2);
    expect(prompts[0]).toContain("fixture exec node");
    expect(prompts[1]).toContain("File your debrief");
  },
);

slowIntegration(
  "keeps a pending pane intent unresolved while exec runs without herdr",
  {
    budgetMs: 15_000,
    reason: "integrates exec phases with a retained pending pane outbox intent",
  },
  async () => {
    const cwd = fixture();
    const script = join(cwd, "record-pending.mjs");
    writeFileSync(script, "process.exit(0);\n");
    const catalogue = join(cwd, "runtimes.yaml");
    writeFileSync(catalogue, execCatalogue(process.execPath, script));
    commitAll(cwd, "add pending exec fixture");
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });

    const journal = await sharedJournalDirectory(cwd);
    const opened = await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: journal,
    });
    if (isErr(opened)) throw new Error(String(opened.error));
    const hold: MachineHold = {
      token: "pane-session/work",
      pane: "pane-1",
      cwd,
      release: ["fixture-release"],
      env: {},
    };
    const intent = machineIntent(
      opened.value,
      { graph: "demo", id: "a" },
      "pane-session",
      "admit",
      hold,
    );
    if (isErr(intent)) throw new Error(intent.error);
    await opened.value.close();

    const narration: string[] = [];
    herdrFreeEnvironment();
    const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], {
      cwd,
      narrate: (line) => narration.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(narration).toContain(
      "machine recovery unresolved: pending pane-era intents remain recorded",
    );
    await assertDoneExecPhases(cwd);
    const after = await createLedger({
      clock: createControlledClock({ initialTime: 1 }),
      directory: journal,
    });
    if (isErr(after)) throw new Error(String(after.error));
    expect(after.value.projection().outbox.has(intent.value)).toBe(true);
    await after.value.close();
  },
);

slowIntegration(
  "lists a running exec session after the sessions synchronization barrier",
  {
    budgetMs: 20_000,
    reason: "integrates a blocked child process, synchronization barrier and live session listing",
  },
  async () => {
    const cwd = fixture();
    const barrier = join(runsRoot, `barrier-${process.pid}`);
    const script = join(cwd, "barrier.mjs");
    writeFileSync(
      script,
      [
        'import { existsSync, writeFileSync } from "node:fs";',
        "const barrier = process.env.INTERLOCK_EXEC_BARRIER;",
        "if (barrier !== undefined) {",
        '  writeFileSync(barrier + ".started", "started");',
        '  while (!existsSync(barrier + ".release")) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);',
        "}",
        "",
      ].join("\n"),
    );
    const catalogue = join(cwd, "runtimes.yaml");
    writeFileSync(catalogue, execCatalogue(process.execPath, script));
    commitAll(cwd, "add barrier exec fixture");
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    process.env["INTERLOCK_EXEC_BARRIER"] = barrier;
    await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
    herdrFreeEnvironment();

    const running = runInterlockRun(["demo", "a", "--runtime", "fixture"], { cwd });
    for (let attempt = 0; attempt < 100 && !existsSync(`${barrier}.started`); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(existsSync(`${barrier}.started`)).toBe(true);
    const listed = await runSessions(["--json"], { cwd });
    expect(listed.exitCode).toBe(0);
    expect(listed.message).toContain('"runtime":"fixture"');
    expect(listed.message).toContain('"state":"running"');
    writeFileSync(`${barrier}.release`, "release");
    const result = await running;

    expect(result.exitCode).toBe(0);
    await assertDoneExecPhases(cwd);
  },
);

slowIntegration(
  "judges a held unleased exec session with --session",
  {
    budgetMs: 15_000,
    reason: "integrates exec completion, held ledger state and explicit session judging",
  },
  async () => {
    const cwd = fixture();
    const script = join(cwd, "hold.mjs");
    writeFileSync(script, ["process.exit(0);", ""].join("\n"));
    const catalogue = join(cwd, "runtimes.yaml");
    writeFileSync(catalogue, execCatalogue(process.execPath, script));
    commitAll(cwd, "add held exec fixture");
    process.env["INTERLOCK_RUNTIMES"] = catalogue;
    await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
    herdrFreeEnvironment();

    const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], { cwd });
    expect(result.exitCode).toBe(0);
    await assertDoneExecPhases(cwd);

    const journal = await sharedJournalDirectory(cwd);
    const opened = await createLedger({
      clock: createControlledClock({ initialTime: 1 }),
      directory: journal,
    });
    if (isErr(opened)) throw new Error(String(opened.error));
    const session = sessionIdFromLedger(opened.value);
    opened.value.append({
      kind: "outcome-set",
      node: { graph: "demo", id: "a" },
      outcome: outcome.held(
        [],
        heldOn.uncommittedWork(1),
        "fixture leaves a held, unleased exec session",
        86_400_001,
      ),
    });
    await opened.value.close();
    writeFileSync(join(cwd, ".worktrees", "a", "held-by-exec.txt"), "held\n");
    const judged = await runInterlockJudge(["demo", "a", "--session", session], {
      cwd,
      clock: createControlledClock({ initialTime: Date.now() + 120_000 }),
    });
    expect(judged.exitCode).toBe(0);
    expect(judged.message).toContain(`session ${session}, judged by hand`);
  },
);

it("keeps pane launches on today's herdr-not-ready refusal", async () => {
  const cwd = fixture();
  const catalogue = join(cwd, "runtimes.yaml");
  writeFileSync(catalogue, paneCatalogue());
  commitAll(cwd, "add pane fixture");
  process.env["INTERLOCK_RUNTIMES"] = catalogue;
  await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
  herdrFreeEnvironment();

  const result = await runInterlockRun(["demo", "a", "--runtime", "pane"], { cwd });

  expect(result.exitCode).toBe(1);
  expect(result.message).toBe("herdr's server is not running; open herdr and run again");
}, 30_000);

it("does not call an injected failing herdr runtime for exec", async () => {
  const cwd = fixture();
  const script = join(cwd, "injected-runtime.mjs");
  writeFileSync(script, "process.exit(0);\n");
  const catalogue = join(cwd, "runtimes.yaml");
  writeFileSync(catalogue, execCatalogue(process.execPath, script));
  commitAll(cwd, "add injected-runtime fixture");
  process.env["INTERLOCK_RUNTIMES"] = catalogue;
  await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "fixture"], { cwd });
  herdrFreeEnvironment();
  const calls: string[] = [];
  const never = (): never => {
    throw new Error("injected herdr runtime method called");
  };
  const injected: Runtime = {
    checkServer: () => {
      calls.push("checkServer");
      return Promise.resolve(err({ kind: "not-ready", message: "injected failure" }));
    },
    openPane: never,
    startAgent: never,
    reportIdentity: never,
    prompt: never,
    waitUntil: never,
    read: never,
    sendKeys: never,
    sendPaneKeys: never,
    closePane: never,
  };

  const result = await runInterlockRun(["demo", "a", "--runtime", "fixture"], {
    cwd,
    runtime: injected,
  });

  expect(result.exitCode).toBe(0);
  expect(calls).toEqual([]);
  await assertDoneExecPhases(cwd);
}, 30_000);
