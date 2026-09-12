import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findCommentViolations } from "../../../scripts/noComments.ts";

const fixturesDir = join(import.meta.dirname, "noComments", "fixtures");

describe("findCommentViolations", () => {
  it("flags a file that carries a real comment", () => {
    const source = readFileSync(join(fixturesDir, "hasComment.ts"), "utf-8");
    expect(findCommentViolations(source)).toEqual([1]);
  });

  it("passes a file whose only comment is a biome-ignore line with a reason", () => {
    const source = readFileSync(join(fixturesDir, "biomeIgnoreOnly.ts"), "utf-8");
    expect(findCommentViolations(source)).toEqual([]);
  });
});
