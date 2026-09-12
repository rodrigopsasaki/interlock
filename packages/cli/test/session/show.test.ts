import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { type Brief, createLedger, type Debrief, gate, type Ledger, note } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runSessionShow } from "../../src/session/show.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "session-show-"));
  gitInitFixture(directory);
  return directory;
}

async function openLedger(cwd: string): Promise<Ledger> {
  return unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: sharedJournalDirectory(cwd),
    }),
  );
}

const brief: Brief = {
  graph: "demo",
  node: "a",
  role: "worker",
  acceptance: "the thing this node must do",
  gates: ["typecheck"],
  scope: [],
};

const v2Debrief: Debrief = {
  graph: "demo",
  node: "a",
  role: "worker",
  graphBaseSha: "a".repeat(40),
  sessionStartSha: "a".repeat(40),
  headSha: "b".repeat(40),
  derivation: {
    kind: "agent",
    runtime: "claude-code",
    model: "claude-sonnet-5",
  },
  discoveries: [
    {
      id: "d1",
      what: "found a thing",
      foundAt: "some/path.ts",
      matteredBecause: "it mattered",
    },
  ],
  decisions: [
    {
      id: "c1",
      what: "did a thing",
      because: "the brief asked for it",
      restsOn: [],
      hunks: ["some/path.ts:1-2"],
    },
  ],
  gatesRunByAgent: [],
  open: [],
};

describe("interlock session show", () => {
  it("prints a sentence, exit 0, when no session is recorded for the node", async () => {
    const cwd = fixture();
    const result = await runSessionShow(["demo", "a"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("demo/a: no session recorded for this node.");
  });

  it("refuses with a sentence when no graph or node is given", async () => {
    const result = await runSessionShow([]);
    expect(result.exitCode).not.toBe(0);
  });

  it("prints the five columns, notes and narration for the latest session by default", async () => {
    const cwd = fixture();
    const node = { graph: "demo", id: "a" };
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
      graphBaseSha: "a".repeat(40),
    });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "typecheck",
      to: gate.satisfied({
        id: "r1",
        gate: "typecheck",
        commitSha: "a".repeat(40),
        spend: { kind: "none" },
        duration: { kind: "unknown" },
        derivation: {
          kind: "gate",
          gate: "typecheck",
          version: "1",
          runner: "runner",
        },
        proof: {},
      }),
    });
    ledger.append({
      kind: "note-appended",
      session: "s1",
      note: note.surprise("2026-09-09T00:00:00Z", "x", "y"),
    });
    ledger.append({
      kind: "session-narrated",
      session: "s1",
      at: 10,
      line: "leased a",
    });
    ledger.append({
      kind: "debrief-filed",
      session: "s1",
      debrief: v2Debrief,
    });
    ledger.append({
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [] },
    });
    await ledger.close();

    const result = await runSessionShow(["demo", "a"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("demo/a · session s1");
    expect(result.message).toContain("acceptance: the thing this node must do");
    expect(result.message).toContain("typecheck: satisfied (receipt r1)");
    expect(result.message).toContain("derivation: runtime claude-code, model claude-sonnet-5");
    expect(result.message).toContain("d1: found a thing");
    expect(result.message).toContain("c1: some/path.ts:1-2");
    expect(result.message).not.toContain("because: the brief asked for it");
    expect(result.message).toContain("expected x, observed y");
    expect(result.message).toContain("leased a");
  });

  it("prints a decision's because only with --because", async () => {
    const cwd = fixture();
    const node = { graph: "demo", id: "a" };
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
    });
    ledger.append({ kind: "debrief-filed", session: "s1", debrief: v2Debrief });
    await ledger.close();

    const result = await runSessionShow(["demo", "a", "--because"], { cwd });
    expect(result.message).toContain("because: the brief asked for it");
  });

  it("refuses with a sentence when --session names a session not recorded for this node", async () => {
    const cwd = fixture();
    const result = await runSessionShow(["demo", "a", "--session", "bogus"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("bogus");
  });

  it("says which version a legacy debrief carries, on the latest session, without ingesting it", async () => {
    const cwd = fixture();
    const node = { graph: "demo", id: "a" };
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
    });
    await ledger.close();

    const sessionDir = join(cwd, ".interlock", "sessions", "demo", "a");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      join(sessionDir, "debrief.yaml"),
      [
        "interlock: debrief@v1",
        "graph: demo",
        "node: a",
        "role: worker",
        `graph_base_sha: ${"a".repeat(40)}`,
        `session_start_sha: ${"a".repeat(40)}`,
        `head_sha: ${"b".repeat(40)}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions:",
        "  - id: c1",
        "    what: did a thing",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );

    const result = await runSessionShow(["demo", "a"], { cwd });
    expect(result.message).toContain("valid as debrief@v1; not ingested");
  });
});
