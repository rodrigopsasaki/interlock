import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import type { Debrief } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { verifyDebrief } from "../src/verify.ts";
import { commitAll, gitInitFixture } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const AGENTS_MD = [
  "## Vocabulary",
  "",
  "| term | means |",
  "| --- | --- |",
  "| widget | A thing. |",
  "",
  "## Next",
].join("\n");

function baseDebrief(overrides: Partial<Debrief>): Debrief {
  return {
    graph: "0001-bootstrap",
    node: "verifier-hunks",
    role: "worker",
    graphBaseSha: "a".repeat(40),
    sessionStartSha: "a".repeat(40),
    headSha: "b".repeat(40),
    derivation: { kind: "agent", runtime: "test", model: "test" },
    discoveries: [],
    decisions: [],
    gatesRunByAgent: [],
    open: [],
    ...overrides,
  };
}

function fixtureRepo(): {
  readonly dir: string;
  readonly from: string;
  readonly to: string;
} {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  writeFileSync(join(directory, "AGENTS.md"), AGENTS_MD);
  const from = commitAll(directory, "root");

  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(
    join(directory, "src/widget.ts"),
    ["export interface Widget {", "  readonly id: string;", "}", ""].join("\n"),
  );
  writeFileSync(join(directory, "orphan.ts"), "export const x = 1;\n");
  const to = commitAll(directory, "add widget and orphan");

  return { dir: directory, from, to };
}

describe("verifyDebrief", () => {
  it("refuses a range whose SHAs are not commits in this repository", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    gitInitFixture(directory);
    writeFileSync(join(directory, "AGENTS.md"), AGENTS_MD);
    commitAll(directory, "root");

    const result = await verifyDebrief(
      directory,
      baseDebrief({
        sessionStartSha: "c".repeat(40),
        headSha: "d".repeat(40),
      }),
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("range-not-in-history");
  });

  it("roots a decision's hunk, gaps an unrecognized type name, and marks the uncovered file unexplained", async () => {
    const { dir, from, to } = fixtureRepo();
    const debrief = baseDebrief({
      sessionStartSha: from,
      headSha: to,
      decisions: [
        {
          id: "c1",
          what: "added Widget",
          because: "test",
          restsOn: [],
          hunks: ["src/widget.ts:1-3"],
        },
      ],
    });

    const result = await verifyDebrief(dir, debrief, { runner: "test" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    const marks = result.value.marks;
    expect(marks.filter((m) => m.kind === "rooted")).toHaveLength(1);
    // "widget" is in AGENTS.md's Vocabulary table; PascalCase "Widget" is an accepted form.
    expect(marks.some((m) => m.kind === "gap" && m.gap.term === "Widget")).toBe(false);
    expect(marks.some((m) => m.kind === "unexplained" && m.hunk === "orphan.ts")).toBe(true);
  });

  it("groups the flat marks back by the decision and discovery that produced each", async () => {
    const { dir, from, to } = fixtureRepo();
    const debrief = baseDebrief({
      sessionStartSha: from,
      headSha: to,
      decisions: [
        {
          id: "c1",
          what: "added Widget",
          because: "test",
          restsOn: [],
          hunks: ["src/widget.ts:1-3", "no-such-file.ts"],
        },
      ],
      discoveries: [
        {
          id: "d1",
          what: "orphan.ts exists",
          foundAt: "orphan.ts",
          matteredBecause: "test",
        },
      ],
    });

    const result = await verifyDebrief(dir, debrief, { runner: "test" });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;

    expect(result.value.decisionMarks).toHaveLength(1);
    expect(result.value.decisionMarks[0]?.decision.id).toBe("c1");
    expect(result.value.decisionMarks[0]?.marks.map((m) => m.kind)).toEqual(["rooted", "unrooted"]);

    expect(result.value.discoveryMarks).toHaveLength(1);
    expect(result.value.discoveryMarks[0]?.discovery.id).toBe("d1");
    expect(result.value.discoveryMarks[0]?.mark.kind).toBe("rooted");

    // Grouped and flat agree: every rooted/unrooted mark in the flat list is one of the
    // hunk-citation marks the groups above already account for.
    const flatHunkKinds = result.value.marks
      .filter((m) => m.kind === "rooted" || m.kind === "unrooted")
      .map((m) => m.kind);
    expect(flatHunkKinds).toEqual(["rooted", "unrooted", "rooted"]);
  });
});
