import { isErr } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { parseCommitPlan } from "../../runner/src/runnerCommits.ts";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const schema = validatorFor(buildRegistry(), "commits@v0");
function valid(value: unknown): boolean {
  if (schema === undefined) throw new Error("missing commits@v0");
  return schema(value) === true;
}
function plan(message: string, path: string): unknown {
  return { interlock: "commits@v0", entries: [{ message, paths: [path] }] };
}

describe("commits@v0", () => {
  it("accepts empty entries and optional fallback and authorship", () => {
    expect(valid({ interlock: "commits@v0", entries: [] })).toBe(true);
    expect(
      valid({
        ...planObject(),
        fallback_subject: "fix: preserve changes",
        co_authored_by: "Model <model@example.invalid>",
      }),
    ).toBe(true);
  });
  it("accepts a multiline message with a 100-character first line", () => {
    expect(valid(plan(`${"x".repeat(100)}\n\nBecause.`, "src/a.ts"))).toBe(true);
  });
  it.each(["", " ", "x".repeat(101), "\nbody"])("refuses invalid message %j", (message) => {
    expect(valid(plan(message, "a.ts"))).toBe(false);
    expect(isErr(parseCommitPlan(plan(message, "a.ts")))).toBe(true);
  });
  it.each([
    "/root",
    "../a",
    "a/../b",
    "a/*",
    "a/?.ts",
    "a/[b]",
    "a/{b}",
    "C:\\root",
    "a\\b",
    "./a",
    "a//b",
    "a/",
  ])("refuses nonliteral path %j", (path) => {
    expect(valid(plan("fix: keep literal paths", path))).toBe(false);
    expect(isErr(parseCommitPlan(plan("fix: keep literal paths", path)))).toBe(true);
  });
});
function planObject() {
  return {
    interlock: "commits@v0",
    entries: [{ message: "fix: preserve changes", paths: ["src/a.ts"] }],
  };
}
