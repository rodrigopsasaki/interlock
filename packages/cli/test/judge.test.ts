import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, ok } from "@phyxiusjs/fp";
import { isLedgerEvent } from "ledger";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockJudge } from "../src/judge.ts";
import { runInterlockRun } from "../src/run.ts";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    acceptance: a trivial node",
  "    depends_on: []",
  "    gates:",
  "      - id: own-gate",
  "        kind: command",
  '        run: "true"',
  "",
].join("\n");

const configYaml = [
  "interlock: config@v0",
  "standing_gates:",
  "  - id: standing",
  "    kind: command",
  '    run: "true"',
  "",
].join("\n");

const localYaml = [
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

const demoBriefV1 = [
  "---",
  "interlock: brief@v1",
  "graph: demo",
  "node: a",
  "role: worker",
  "gates:",
  "  - id: standing",
  "    kind: command",
  '    run: "true"',
  "  - id: own-gate",
  "    kind: command",
  '    run: "true"',
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
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "judge-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
  mkdirSync(join(directory, ".interlock", "sessions", "demo", "a"), {
    recursive: true,
  });
  writeFileSync(join(directory, ".interlock", "sessions", "demo", "a", "brief.md"), demoBriefV1);
  gitInitFixture(directory);
  commitAll(directory, "fixture content");
  return directory;
}

function stubRuntime(): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    // This stub never carries a debrief, so once the runner's own grace window arms, the only
    // status it can ever be asked to wait for again is "working" (AFTER_SETTLED). Answering
    // that the way herdr does, a refusal rather than the same settled status forever, is what
    // lets the window close on its own deadline instead of spinning.
    waitUntil: (_agent, until, timeoutMs) =>
      until.length === 1 && until[0] === "working"
        ? Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }))
        : Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

function sessionIdFrom(message: string): string {
  const match = message.match(/session ([^,]+),/);
  if (match === null || match[1] === undefined) {
    throw new Error(`expected a session id in "${message}"`);
  }
  return match[1];
}

async function approve(cwd: string): Promise<void> {
  await runGraphApprove(["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"], { cwd });
}

// The stub runtime's screen read succeeds, so run.ts's own screen-snapshot write leaves the
// worktree carrying one uncommitted file after every run; settle it so a judge test's own
// dirty/clean setup starts from a genuinely clean worktree, not run's own leftovers.
function settle(worktreePath: string): void {
  commitAll(worktreePath, "settle the run's own screen snapshot");
}

const SHA = "c".repeat(40);

const debriefYaml = [
  "interlock: debrief@v2",
  "graph: demo",
  "node: a",
  "role: worker",
  `graph_base_sha: ${SHA}`,
  `session_start_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

describe("interlock judge", () => {
  it("refuses without a graph and node", async () => {
    const result = await runInterlockJudge([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock judge");
  });

  it("refuses a graph that has never been approved", async () => {
    const cwd = fixture();

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("not approved");
    expect(judged.message).toContain('refusing to judge "a"');
  });

  it("refuses a graph whose approval is stale", async () => {
    const cwd = fixture();
    await approve(cwd);

    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), `${graphYaml} `);

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("graph is stale");
    expect(judged.message).toContain('refusing to judge "a"');
  });

  it("clears a clean worktree that carries a committed debrief", async () => {
    const cwd = fixture();
    await approve(cwd);

    const ran = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
    });
    expect(ran.exitCode).toBe(0);
    expect(ran.message).toContain("cleared");
    const sessionId = sessionIdFrom(ran.message);

    const worktreePath = join(cwd, ".worktrees", "a");
    mkdirSync(join(worktreePath, ".interlock", "sessions", "demo", "a"), {
      recursive: true,
    });
    writeFileSync(
      join(worktreePath, ".interlock", "sessions", "demo", "a", "debrief.yaml"),
      debriefYaml,
    );
    commitAll(worktreePath, "file the debrief");

    const judged = await runInterlockJudge(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 61_000 }),
    });

    expect(judged.exitCode).toBe(0);
    expect(judged.message).toBe(`a: cleared (session ${sessionId}, judged by hand)`);
  }, 30_000);

  it("holds a dirty worktree on uncommitted work without running a gate", async () => {
    const cwd = fixture();
    await approve(cwd);

    const ran = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
    });
    expect(ran.exitCode).toBe(0);
    expect(ran.message).toContain("cleared");
    const sessionId = sessionIdFrom(ran.message);

    const worktreePath = join(cwd, ".worktrees", "a");
    settle(worktreePath);
    writeFileSync(join(worktreePath, "uncommitted.txt"), "staged, never committed\n");

    const lines: string[] = [];
    const judged = await runInterlockJudge(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 61_000 }),
      narrate: (line) => lines.push(line),
    });

    expect(judged.exitCode).toBe(0);
    expect(judged.message).toBe(`a: held (session ${sessionId}, judged by hand)`);
    expect(lines).toContain("1 uncommitted path(s) in the worktree; gates judge commits only");
    expect(lines).toContain("  uncommitted.txt");

    const journal = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
    const narrated = journal
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line))
      .filter(isLedgerEvent)
      .filter((event) => event.kind === "session-narrated");
    expect(narrated.every((event) => event.session === sessionId)).toBe(true);
    expect(narrated.map((event) => event.line).slice(-2)).toEqual([
      "1 uncommitted path(s) in the worktree; gates judge commits only",
      "  uncommitted.txt",
    ]);
  }, 30_000);

  it("refuses a node whose lease has not expired", async () => {
    const cwd = fixture();
    await approve(cwd);
    const clock = createControlledClock({ initialTime: 0 });

    const ran = await runInterlockRun(["demo", "a"], {
      cwd,
      clock,
      runtime: stubRuntime(),
    });
    expect(ran.exitCode).toBe(0);
    const sessionId = sessionIdFrom(ran.message);

    const judged = await runInterlockJudge(["demo", "a"], { cwd, clock });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toBe(
      `a is leased by session ${sessionId} until 1970-01-01T00:01:00.000Z; wait for it or run interlock sweep.`,
    );
  }, 30_000);

  it("refuses a node with no worktree", async () => {
    const cwd = fixture();
    await approve(cwd);

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("no worktree there");
  });

  it("refuses a worktree with no session recorded for the node", async () => {
    const cwd = fixture();
    await approve(cwd);
    const worktreePath = join(cwd, ".worktrees", "a");
    mkdirSync(worktreePath, { recursive: true });
    gitInitFixture(worktreePath);
    writeFileSync(join(worktreePath, "unattributed-work.txt"), "found, not run by interlock\n");
    commitAll(worktreePath, "worktree content with no recorded session");

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("no session recorded");
  });

  it("proceeds to judgement when --session names a node with no session recorded", async () => {
    const cwd = fixture();
    await approve(cwd);
    const worktreePath = join(cwd, ".worktrees", "a");
    mkdirSync(worktreePath, { recursive: true });
    gitInitFixture(worktreePath);
    writeFileSync(join(worktreePath, "unattributed-work.txt"), "found, not run by interlock\n");
    commitAll(worktreePath, "worktree content with no recorded session");

    const judged = await runInterlockJudge(["demo", "a", "--session", "hand-named-session"], {
      cwd,
    });

    expect(judged.exitCode).toBe(0);
    expect(judged.message).toBe("a: cleared (session hand-named-session, judged by hand)");
  });

  it("lets --session override the ledger's latest session", async () => {
    const cwd = fixture();
    await approve(cwd);

    const first = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
    });
    expect(first.exitCode).toBe(0);
    const firstSessionId = sessionIdFrom(first.message);
    const worktreePath = join(cwd, ".worktrees", "a");
    settle(worktreePath);

    const second = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 100_000 }),
      runtime: stubRuntime(),
    });
    expect(second.exitCode).toBe(0);
    const secondSessionId = sessionIdFrom(second.message);
    expect(secondSessionId).not.toBe(firstSessionId);

    const judged = await runInterlockJudge(["demo", "a", "--session", firstSessionId], {
      cwd,
      clock: createControlledClock({ initialTime: 200_000 }),
    });

    expect(judged.exitCode).toBe(0);
    expect(judged.message).toBe(`a: cleared (session ${firstSessionId}, judged by hand)`);
  }, 30_000);
});
