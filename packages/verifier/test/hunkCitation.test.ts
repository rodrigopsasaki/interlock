import { isErr, isOk } from "@phyxiusjs/fp";
import { derivation } from "ledger";
import { describe, expect, it } from "vitest";
import type { FileDiff } from "../src/git.ts";
import { checkHunkCitation, parseHunkCitation } from "../src/hunkCitation.ts";

const DERIVATION = derivation.gate("verifier-hunks", "verifier@0", "test");

describe("parseHunkCitation", () => {
  it("parses a bare path with no range", () => {
    const parsed = parseHunkCitation("packages/verifier/src/git.ts");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual({ path: "packages/verifier/src/git.ts" });
  });

  it("parses a path with a start-end range", () => {
    const parsed = parseHunkCitation("a/b.ts:10-20");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual({
      path: "a/b.ts",
      range: { start: 10, end: 20 },
    });
  });

  it("parses a path with a single line", () => {
    const parsed = parseHunkCitation("a/b.ts:5");
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual({
      path: "a/b.ts",
      range: { start: 5, end: 5 },
    });
  });

  it("treats a trailing non-numeric colon suffix as part of the path", () => {
    const parsed = parseHunkCitation(
      ".interlock/graphs/x.yaml:stale-approval gate",
    );
    expect(isOk(parsed)).toBe(true);
    if (!isOk(parsed)) return;
    expect(parsed.value).toEqual({
      path: ".interlock/graphs/x.yaml:stale-approval gate",
    });
  });

  it("refuses an empty citation", () => {
    const parsed = parseHunkCitation("  ");
    expect(isErr(parsed)).toBe(true);
  });

  it("refuses a range with no path before it", () => {
    const parsed = parseHunkCitation(":10-20");
    expect(isErr(parsed)).toBe(true);
  });

  it("refuses a range whose end is before its start", () => {
    const parsed = parseHunkCitation("a/b.ts:20-10");
    expect(isErr(parsed)).toBe(true);
  });
});

describe("checkHunkCitation", () => {
  const files: readonly FileDiff[] = [
    {
      path: "src/a.ts",
      hunks: [
        { start: 1, end: 22 },
        { start: 40, end: 40 },
      ],
      addedLines: [],
    },
  ];

  it("roots a path-only citation for a file that changed", () => {
    const result = checkHunkCitation("src/a.ts", files, DERIVATION);
    expect(result.kind).toBe("rooted");
  });

  it("unroots a citation for a path that did not change", () => {
    const result = checkHunkCitation("src/missing.ts", files, DERIVATION);
    expect(result.kind).toBe("unrooted");
  });

  it("roots a range that exactly matches an added hunk", () => {
    const result = checkHunkCitation("src/a.ts:1-22", files, DERIVATION);
    expect(result.kind).toBe("rooted");
  });

  it("roots a range that overlaps an added hunk without matching it exactly", () => {
    const result = checkHunkCitation("src/a.ts:15-25", files, DERIVATION);
    expect(result.kind).toBe("rooted");
  });

  it("roots one broad citation that spans two separate hunks", () => {
    const result = checkHunkCitation("src/a.ts:1-40", files, DERIVATION);
    expect(result.kind).toBe("rooted");
  });

  it("unroots a range on a changed file that overlaps no added hunk", () => {
    const result = checkHunkCitation("src/a.ts:100-110", files, DERIVATION);
    expect(result.kind).toBe("unrooted");
  });

  it("unroots a malformed citation with a sentence naming why", () => {
    const result = checkHunkCitation(":10-20", files, DERIVATION);
    expect(result.kind).toBe("unrooted");
    if (result.kind !== "unrooted") return;
    expect(result.because).toContain("malformed hunk citation");
  });
});
