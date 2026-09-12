import { type Decision, derivation } from "ledger";
import { describe, expect, it } from "vitest";
import type { FileDiff } from "../src/git.ts";
import { unexplainedMarks } from "../src/inverse.ts";

const DERIVATION = derivation.gate("verifier-hunks", "verifier@0", "test");

function fileDiff(path: string): FileDiff {
  return { path, hunks: [{ start: 1, end: 1 }], addedLines: [] };
}

function decision(hunks: readonly string[], produces?: readonly string[]): Decision {
  return {
    id: "c1",
    what: "test decision",
    because: "test",
    restsOn: [],
    hunks,
    ...(produces === undefined ? {} : { produces }),
  };
}

describe("unexplainedMarks (the inverse check)", () => {
  it("marks a changed file with no covering decision as unexplained", () => {
    const files = [fileDiff("src/a.ts")];
    const marks = unexplainedMarks(files, [], DERIVATION);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("unexplained");
    if (marks[0]?.kind !== "unexplained") return;
    expect(marks[0].hunk).toBe("src/a.ts");
  });

  it("produces no unexplained mark for a file a decision's hunks cite, range aside", () => {
    const files = [fileDiff("src/a.ts")];
    const decisions = [decision(["src/a.ts:1-1"])];
    expect(unexplainedMarks(files, decisions, DERIVATION)).toEqual([]);
  });

  it("produces no unexplained mark for a file a decision's produces names", () => {
    const files = [fileDiff("pnpm-lock.yaml")];
    const decisions = [decision(["src/a.ts:1-1"], ["pnpm-lock.yaml"])];
    expect(unexplainedMarks(files, decisions, DERIVATION)).toEqual([]);
  });

  it("marks every uncovered file, leaving covered ones unexplained-free, across many changed files", () => {
    const files = [fileDiff("src/a.ts"), fileDiff("src/b.ts"), fileDiff("src/c.ts")];
    const decisions = [decision(["src/a.ts"])];
    const marks = unexplainedMarks(files, decisions, DERIVATION);
    expect(marks.map((m) => (m.kind === "unexplained" ? m.hunk : undefined))).toEqual([
      "src/b.ts",
      "src/c.ts",
    ]);
  });

  it("does not let a malformed hunk citation cover the file it failed to name", () => {
    const files = [fileDiff("src/a.ts")];
    const decisions = [decision([":not-a-path"])];
    const marks = unexplainedMarks(files, decisions, DERIVATION);
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("unexplained");
  });
});
