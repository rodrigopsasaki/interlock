import { describe, expect, it } from "vitest";
import { isAppliesTo, isSafeAppliesToPath } from "../src/applicability.ts";

describe("applies_to", () => {
  it("accepts repository and ordinary nested repository paths", () => {
    expect(isAppliesTo({ kind: "repository" })).toBe(true);
    expect(isAppliesTo({ kind: "path", path: "packages/substrate/src/evidence.ts" })).toBe(true);
    expect(
      isSafeAppliesToPath("docs/experiments/comparable-learning/inputs/source-debrief.yaml"),
    ).toBe(true);
  });

  it("refuses non-canonical, rooted, drive, and NUL paths", () => {
    for (const path of [
      "",
      ".",
      "./",
      "./.",
      " ",
      " /outside",
      " ../outside",
      "../outside",
      "a/../outside",
      "/outside",
      "\\outside",
      "C:\\outside",
      "a\\b",
      "a\0b",
    ]) {
      expect(isSafeAppliesToPath(path)).toBe(false);
      expect(isAppliesTo({ kind: "path", path })).toBe(false);
    }
  });

  it("refuses organisation scope and extra applicability fields", () => {
    expect(isAppliesTo({ kind: "organisation" })).toBe(false);
    expect(isAppliesTo({ kind: "repository", path: "src" })).toBe(false);
  });
});
