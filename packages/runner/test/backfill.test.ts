import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import type { GraphDocument } from "face";
import { nodeKey } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { backfillGraph } from "../src/backfill.ts";
import { memoryLedger } from "./support/memoryLedger.ts";
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

const document: GraphDocument = {
  id: "fixture-graph",
  gates: [],
  nodes: [
    {
      id: "node-a",
      dependsOn: [],
      gates: [{ id: "own-gate", kind: "command", run: "true" }],
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
      standingGates: [{ id: "standing", run: "true" }],
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
      standingGates: [{ id: "standing", run: "false" }],
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
});
