import { describe, expect, it } from "vitest";
import { scopeFromIndex } from "../src/scope.ts";

const file = "100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\ta.txt";
const gitlink = "160000 1111111111111111111111111111111111111111 0\tvendor/lib";

describe("scopeFromIndex", () => {
  it("reads files and gitlinks, skipping only the empty record after the last NUL", () => {
    expect(scopeFromIndex("/repo", `${file}\0${gitlink}\0`)).toEqual([
      { kind: "file", path: "a.txt" },
      { kind: "gitlink", path: "vendor/lib", commit: "1111111111111111111111111111111111111111" },
    ]);
  });

  it("refuses a record it cannot read and names it, instead of leaving it out of the scope", () => {
    expect(() => scopeFromIndex("/repo", `${file}\0not an index record\0`)).toThrow(
      /cannot read.*"not an index record"/,
    );
  });
});
