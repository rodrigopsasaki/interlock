import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, ok, unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, sessionRuntime } from "ledger";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import {
  type FakeSubstrateServer,
  startFakeSubstrateServer,
} from "../../substrate/test/support/fakeSubstrateServer.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockJudge } from "../src/judge.ts";
import { runInterlockRun } from "../src/run.ts";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";
import { slowIntegration } from "./support/slowIntegration.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let server: FakeSubstrateServer | undefined;
const savedRuntimesEnv = process.env["INTERLOCK_RUNTIMES"];

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (savedRuntimesEnv === undefined) delete process.env["INTERLOCK_RUNTIMES"];
  else process.env["INTERLOCK_RUNTIMES"] = savedRuntimesEnv;
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

function fixture(local = localYaml): string {
  directory = mkdtempSync(join(runsRoot, "judge-"));
  process.env["INTERLOCK_RUNTIMES"] = join(directory, "does-not-exist.yaml");
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  writeFileSync(join(directory, ".interlock", "local.yaml"), local);
  mkdirSync(join(directory, ".interlock", "sessions", "demo", "a"), {
    recursive: true,
  });
  writeFileSync(join(directory, ".interlock", "sessions", "demo", "a", "brief.md"), demoBriefV1);
  gitInitFixture(directory);
  commitAll(directory, "fixture content");
  return directory;
}

function localYamlFor(address: string): string {
  return localYaml.replace("  address: none", `  address: ${address}\n  send_repository: true`);
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
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    observe: () =>
      Promise.resolve(
        ok({
          attempt: () => ({
            agentStatus: "idle",
            pane: { state: "known", address: "pane-1" },
            liveWork: () => Promise.resolve({ state: "none" }),
          }),
        }),
      ),
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
  slowIntegration(
    "binds an enabled origin through judge's actual absorb client",
    {
      budgetMs: 15_000,
      reason: "integrates CLI judge, real worktree absorption and an enabled substrate origin",
    },
    async () => {
      server = await startFakeSubstrateServer();
      server.responseFor("context", { items: [], vocabulary: "reference@v1" });
      server.responseFor("absorb", {
        decisions_absorbed: [],
        discoveries: [],
        gaps: [],
      });
      const cwd = fixture(localYamlFor(server.url));
      fixtureGit(["remote", "add", "origin", "git@forge.example:owner/name.git"], { cwd });
      await approve(cwd);
      const ran = await runInterlockRun(["demo", "a"], {
        cwd,
        clock: createControlledClock({ initialTime: 0 }),
        runtime: stubRuntime(),
      });
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

      await runInterlockJudge(["demo", "a"], {
        cwd,
        clock: createControlledClock({ initialTime: 61_000 }),
      });

      expect(server.calls.at(-1)?.body).toMatchObject({
        repository: {
          owner: "owner",
          name: "name",
          origin_url: "ssh://forge.example/owner/name.git",
        },
      });
      expect(sessionId).toBeDefined();
    },
  );

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

  it("refuses to re-judge a cleared node with a clean worktree", async () => {
    const cwd = fixture();
    await approve(cwd);

    const ran = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
    });
    expect(ran.exitCode).toBe(0);
    expect(ran.message).toContain("cleared");
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

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("outcome is cleared");
  }, 30_000);

  it("refuses to re-judge a cleared node even when its worktree is dirty", async () => {
    const cwd = fixture();
    await approve(cwd);

    const ran = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
    });
    expect(ran.exitCode).toBe(0);
    expect(ran.message).toContain("cleared");
    const worktreePath = join(cwd, ".worktrees", "a");
    settle(worktreePath);
    writeFileSync(join(worktreePath, "uncommitted.txt"), "staged, never committed\n");

    const judged = await runInterlockJudge(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 61_000 }),
    });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("outcome is cleared");
  }, 30_000);

  it("refuses a node whose lease has not expired", async () => {
    const cwd = fixture();
    await approve(cwd);
    const clock = createControlledClock({ initialTime: 0 });
    const worktreePath = join(cwd, ".worktrees", "a");
    mkdirSync(worktreePath, { recursive: true });
    gitInitFixture(worktreePath);
    writeFileSync(join(worktreePath, "work.txt"), "undecided\n");
    commitAll(worktreePath, "undecided worktree");
    const ledger = unwrap(
      await createLedger({
        clock,
        directory: await sharedJournalDirectory(cwd),
      }),
    );
    ledger.append({
      kind: "session-started",
      session: {
        id: "live-session",
        node: { graph: "demo", id: "a" },
        runtime: sessionRuntime.unknown(),
      },
      brief: {
        graph: "demo",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: ["own-gate"],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: { graph: "demo", id: "a" },
      session: "live-session",
      expiry: 60_000,
    });
    await ledger.close();
    const judged = await runInterlockJudge(["demo", "a"], { cwd, clock });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("is leased by session live-session");
  });

  it("refuses a node with no worktree", async () => {
    const cwd = fixture();
    await approve(cwd);

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("no worktree there");
  });

  it("refuses a decided node before reading a stale worktree", async () => {
    const cwd = fixture();
    await approve(cwd);
    writeFileSync(join(cwd, ".gitignore"), ".worktrees/\n");
    commitAll(cwd, "ignore fixture worktrees");
    const oldMain = fixtureGit(["rev-parse", "main"], { cwd }).trim();
    const worktreePath = join(cwd, ".worktrees", "a");
    fixtureGit(["worktree", "add", "-b", "graph/demo/a", worktreePath, oldMain], { cwd });
    writeFileSync(join(worktreePath, "agent.txt"), "agent work\n");
    commitAll(worktreePath, "agent work");

    const journal = await sharedJournalDirectory(cwd);
    const ledger = unwrap(
      await createLedger({ clock: createControlledClock({ initialTime: 0 }), directory: journal }),
    );
    ledger.append({
      kind: "outcome-set",
      node: { graph: "demo", id: "a" },
      outcome: { kind: "cleared", receipts: [] },
    });
    await ledger.close();

    writeFileSync(join(cwd, "main-code.txt"), "main code\n");
    commitAll(cwd, "main code change");
    const before = fixtureGit(["rev-parse", "HEAD"], { cwd: worktreePath });

    const judged = await runInterlockJudge(["demo", "a"], { cwd });

    expect(judged.exitCode).not.toBe(0);
    expect(judged.message).toContain("outcome is cleared");
    expect(fixtureGit(["rev-parse", "HEAD"], { cwd: worktreePath })).toBe(before);
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
    const worktreePath = join(cwd, ".worktrees", "a");
    mkdirSync(worktreePath, { recursive: true });
    gitInitFixture(worktreePath);
    writeFileSync(join(worktreePath, "work.txt"), "undecided\n");
    commitAll(worktreePath, "undecided worktree");
    const firstSessionId = "first-session";
    const secondSessionId = "second-session";
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory: await sharedJournalDirectory(cwd),
      }),
    );
    for (const session of [firstSessionId, secondSessionId])
      ledger.append({
        kind: "session-started",
        session: {
          id: session,
          node: { graph: "demo", id: "a" },
          runtime: sessionRuntime.unknown(),
        },
        brief: {
          graph: "demo",
          node: "a",
          role: "worker",
          acceptance: "",
          gates: ["own-gate"],
          scope: [],
        },
      });
    await ledger.close();
    expect(secondSessionId).not.toBe(firstSessionId);

    const judged = await runInterlockJudge(["demo", "a", "--session", firstSessionId], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
    });

    expect(judged.exitCode).toBe(0);
    expect(judged.message).toContain(`session ${firstSessionId}`);
    expect(judged.message).not.toContain(`session ${secondSessionId}`);
  });
});
