import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixture } from "./gitFixture.ts";

const { runGraphStatus } = await import("../../src/graph/status.ts");

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const twoNodeGraph = [
  "interlock: graph@v0",
  "id: demo",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "  - id: b",
  "    depends_on: []",
  "",
].join("\n");

function fixture(graphYaml: string, events: readonly unknown[]): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  if (events.length > 0) {
    mkdirSync(join(directory, ".interlock", "ledger"), { recursive: true });
    writeFileSync(
      join(directory, ".interlock", "ledger", "journal.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );
  }
  return directory;
}

function nodeCreated(id: string): unknown {
  return {
    interlock: "event@v4",
    kind: "node-created",
    node: { graph: "demo", id },
  };
}

function cleared(id: string): unknown {
  return {
    interlock: "event@v4",
    kind: "outcome-set",
    node: { graph: "demo", id },
    outcome: { kind: "cleared", receipts: [] },
  };
}

function held(id: string): unknown {
  return {
    interlock: "event@v4",
    kind: "outcome-set",
    node: { graph: "demo", id },
    outcome: {
      kind: "held",
      receipts: [],
      on: { kind: "decision", authority: "a person" },
      because: "a gate failed",
      expiry: 9_999_999_999_999,
    },
  };
}

function briefStub(id: string): unknown {
  return {
    graph: "demo",
    node: id,
    role: "worker",
    acceptance: "x",
    gates: [],
    scope: [],
  };
}

function sessionStarted(id: string, session: string): unknown {
  return {
    interlock: "event@v4",
    kind: "session-started",
    session: { id: session, node: { graph: "demo", id } },
    brief: briefStub(id),
    graphBaseSha: "deadbeef",
  };
}

function leaseTaken(id: string, session: string, expiry: number): unknown {
  return {
    interlock: "event@v4",
    kind: "lease-taken",
    node: { graph: "demo", id },
    session,
    expiry,
  };
}

describe("graph status", () => {
  it("exits zero when every node carries the expected outcome", async () => {
    const cwd = fixture(twoNodeGraph, [
      nodeCreated("a"),
      cleared("a"),
      nodeCreated("b"),
      cleared("b"),
    ]);
    const result = await runGraphStatus(["demo", "--expect", "cleared"], {
      cwd,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("demo");
  });

  it("exits non-zero and names a held node", async () => {
    const cwd = fixture(twoNodeGraph, [
      nodeCreated("a"),
      cleared("a"),
      nodeCreated("b"),
      held("b"),
    ]);
    const result = await runGraphStatus(["demo", "--expect", "cleared"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("b: held");
    expect(result.message).not.toContain("a:");
  });

  it("passes a node with no outcome that is leased by a live session", async () => {
    const cwd = fixture(twoNodeGraph, [
      nodeCreated("a"),
      cleared("a"),
      nodeCreated("b"),
      sessionStarted("b", "session-1"),
      leaseTaken("b", "session-1", 9_999_999_999_999),
    ]);
    const result = await runGraphStatus(["demo", "--expect", "cleared"], {
      cwd,
    });
    expect(result.exitCode).toBe(0);
  });

  it("fails a node with no outcome and no live lease", async () => {
    const cwd = fixture(twoNodeGraph, [nodeCreated("a"), cleared("a"), nodeCreated("b")]);
    const result = await runGraphStatus(["demo", "--expect", "cleared"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("b: no outcome");
  });

  it("does not treat an expired lease as live", async () => {
    const cwd = fixture(twoNodeGraph, [
      nodeCreated("a"),
      cleared("a"),
      nodeCreated("b"),
      sessionStarted("b", "session-1"),
      leaseTaken("b", "session-1", 1),
    ]);
    const result = await runGraphStatus(["demo", "--expect", "cleared"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("b: no outcome");
  });

  it("refuses with a sentence when no graph id is given", async () => {
    const result = await runGraphStatus([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock graph status");
  });

  it("refuses without --expect", async () => {
    const cwd = fixture(twoNodeGraph, []);
    const result = await runGraphStatus(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--expect");
  });

  it("refuses an --expect value that is not an outcome kind", async () => {
    const cwd = fixture(twoNodeGraph, []);
    const result = await runGraphStatus(["demo", "--expect", "sideways"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("sideways");
  });
});
