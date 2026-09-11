import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import type { GraphDocument } from "face";
import { nodeKey } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { backfillGraph, backfillSessionId } from "../src/backfill.ts";
import { memoryLedger, memoryLedgerWithLog } from "./support/memoryLedger.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRepo(): string {
  directory = mkdtempSync(join(runsRoot, "backfill-"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  mkdirSync(
    join(directory, ".interlock", "sessions", "fixture-graph", "node-a"),
    { recursive: true },
  );
  writeFileSync(
    join(
      directory,
      ".interlock",
      "sessions",
      "fixture-graph",
      "node-a",
      "debrief.yaml",
    ),
    "interlock: debrief@v1\n",
  );
  mkdirSync(
    join(directory, ".interlock", "sessions", "fixture-graph", "node-b"),
    { recursive: true },
  );
  writeFileSync(
    join(
      directory,
      ".interlock",
      "sessions",
      "fixture-graph",
      "node-b",
      "debrief.yaml",
    ),
    "interlock: debrief@v1\n",
  );
  mkdirSync(
    join(
      directory,
      ".interlock",
      "sessions",
      "fixture-graph",
      "node-undebriefed",
    ),
    { recursive: true },
  );
  gitInitFixtureWithContent(directory);
  return directory;
}

// Node itself, by its own already-running absolute path: these spawn through the runner's own
// `mise exec --` prefix, and process.execPath needs no PATH lookup on top of that.
const passCommand = `${process.execPath} -e process.exit(0)`;
const failCommand = `${process.execPath} -e process.exit(1)`;

// \x20 stands in for a literal space: the command line is split on whitespace with no shell
// to keep a quoted argument together, so the -e script itself must contain none.
const nonMatchingOutputCommand = `${process.execPath} -e process.stdout.write("Tests\\x200\\x20passed\\x0a")`;

const documentWithExpectOutput: GraphDocument = {
  id: "fixture-graph",
  gates: [],
  nodes: [
    {
      id: "node-a",
      dependsOn: [],
      gates: [
        {
          id: "own-gate",
          kind: "command",
          run: nonMatchingOutputCommand,
          expectOutput: /Tests +[1-9][0-9]* passed/,
        },
      ],
    },
    { id: "node-b", dependsOn: ["node-a"], gates: [] },
    { id: "node-undebriefed", dependsOn: [], gates: [] },
  ],
};

const SHA = "a".repeat(40);

const legacyDebriefYaml = [
  "interlock: debrief@v1",
  "graph: fixture-graph",
  "node: node-a",
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

function fixtureRepoWithLegacyDebrief(): string {
  directory = mkdtempSync(join(runsRoot, "backfill-"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  const sessionDir = join(
    directory,
    ".interlock",
    "sessions",
    "fixture-graph",
    "node-a",
  );
  mkdirSync(sessionDir, { recursive: true });
  writeFileSync(join(sessionDir, "debrief.yaml"), legacyDebriefYaml);
  gitInitFixtureWithContent(directory);
  return directory;
}

const singleNodeDocument: GraphDocument = {
  id: "fixture-graph",
  gates: [],
  nodes: [
    {
      id: "node-a",
      dependsOn: [],
      gates: [{ id: "own-gate", kind: "command", run: passCommand }],
    },
  ],
};

const document: GraphDocument = {
  id: "fixture-graph",
  gates: [],
  nodes: [
    {
      id: "node-a",
      dependsOn: [],
      gates: [{ id: "own-gate", kind: "command", run: passCommand }],
    },
    { id: "node-b", dependsOn: ["node-a"], gates: [] },
    { id: "node-undebriefed", dependsOn: [], gates: [] },
  ],
};

describe("backfill", () => {
  it("gates and clears every debriefed, dependency-cleared node at main's own content", async () => {
    const repoRoot = fixtureRepo();
    const ledger = memoryLedger();

    const backfilled = await backfillGraph({
      repoRoot,
      mainBranch: "main",
      document,
      ledger,
      clock: createControlledClock(),
      standingGates: [{ id: "standing", kind: "command", run: passCommand }],
      worktreeRoot: ".worktrees",
    });

    if (isErr(backfilled)) throw new Error("expected backfill to succeed");
    expect(backfilled.value.map((entry) => entry.node)).toEqual([
      "node-a",
      "node-b",
    ]);
    expect(
      backfilled.value.every((entry) => entry.outcome.kind === "cleared"),
    ).toBe(true);

    const nodeA = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "fixture-graph", id: "node-a" }));
    expect(nodeA?.outcome?.kind).toBe("cleared");
    expect(nodeA?.gates.get("standing")?.kind).toBe("satisfied");
    expect(nodeA?.gates.get("own-gate")?.kind).toBe("satisfied");
  }, 30_000);

  it("still gates a debriefed node whose dependency never clears, because a standing gate always fails", async () => {
    const repoRoot = fixtureRepo();
    const ledger = memoryLedger();

    const backfilled = await backfillGraph({
      repoRoot,
      mainBranch: "main",
      document,
      ledger,
      clock: createControlledClock(),
      standingGates: [{ id: "standing", kind: "command", run: failCommand }],
      worktreeRoot: ".worktrees",
    });

    if (isErr(backfilled)) throw new Error("expected backfill to succeed");
    expect(backfilled.value.map((entry) => entry.node)).toEqual([
      "node-a",
      "node-b",
    ]);
    expect(
      backfilled.value.every((entry) => entry.outcome.kind === "held"),
    ).toBe(true);

    const nodeB = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "fixture-graph", id: "node-b" }));
    expect(nodeB?.gates.get("standing")?.kind).toBe("blocked");
  }, 30_000);

  it("holds a node whose command exits zero but its output does not match the node gate's expect_output", async () => {
    const repoRoot = fixtureRepo();
    const ledger = memoryLedger();

    const backfilled = await backfillGraph({
      repoRoot,
      mainBranch: "main",
      document: documentWithExpectOutput,
      ledger,
      clock: createControlledClock(),
      standingGates: [{ id: "standing", kind: "command", run: passCommand }],
      worktreeRoot: ".worktrees",
    });

    if (isErr(backfilled)) throw new Error("expected backfill to succeed");
    const nodeAResult = backfilled.value.find(
      (entry) => entry.node === "node-a",
    );
    expect(nodeAResult?.outcome.kind).toBe("held");

    const nodeA = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "fixture-graph", id: "node-a" }));
    const ownGate = nodeA?.gates.get("own-gate");
    expect(ownGate?.kind).toBe("blocked");
    if (ownGate?.kind !== "blocked") return;
    expect(ownGate.because).toBe(
      "own-gate: output did not match /Tests +[1-9][0-9]* passed/",
    );
  }, 30_000);

  it("records a session-started event for each node it backfills, built from the node's own acceptance and gates", async () => {
    const repoRoot = fixtureRepoWithLegacyDebrief();
    const ledger = memoryLedger();

    await backfillGraph({
      repoRoot,
      mainBranch: "main",
      document: singleNodeDocument,
      ledger,
      clock: createControlledClock(),
      standingGates: [],
      worktreeRoot: ".worktrees",
    });

    const session = ledger
      .projection()
      .sessions.get(backfillSessionId("fixture-graph", "node-a"));
    expect(session?.brief.graph).toBe("fixture-graph");
    expect(session?.brief.node).toBe("node-a");
    expect(session?.brief.gates).toEqual(["own-gate"]);
    expect(session?.graphBaseSha).toBeDefined();
  }, 30_000);

  it("narrates a legacy debrief as not ingested, on the node's own backfilled session", async () => {
    const repoRoot = fixtureRepoWithLegacyDebrief();
    const ledger = memoryLedger();

    await backfillGraph({
      repoRoot,
      mainBranch: "main",
      document: singleNodeDocument,
      ledger,
      clock: createControlledClock(),
      standingGates: [],
      worktreeRoot: ".worktrees",
    });

    const session = ledger
      .projection()
      .sessions.get(backfillSessionId("fixture-graph", "node-a"));
    expect(session?.debrief).toBeUndefined();
    expect(session?.narration).toHaveLength(1);
    expect(session?.narration[0]?.line).toContain("debrief@v1");
  }, 30_000);

  it("stays idempotent: a second run over the same graph appends no new session-started or narration for a session it already recorded", async () => {
    const repoRoot = fixtureRepoWithLegacyDebrief();
    const { ledger, events } = memoryLedgerWithLog();
    const options = {
      repoRoot,
      mainBranch: "main",
      document: singleNodeDocument,
      ledger,
      clock: createControlledClock(),
      standingGates: [],
      worktreeRoot: ".worktrees",
    };

    await backfillGraph(options);
    const narrationAfterFirst = ledger
      .projection()
      .sessions.get(backfillSessionId("fixture-graph", "node-a"))?.narration;

    await backfillGraph(options);
    const kinds = events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "session-started")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "session-narrated")).toHaveLength(1);
    const narrationAfterSecond = ledger
      .projection()
      .sessions.get(backfillSessionId("fixture-graph", "node-a"))?.narration;
    expect(narrationAfterSecond).toEqual(narrationAfterFirst);
  }, 30_000);
});
