import type { Discovery } from "ledger";
import { describe, expect, it } from "vitest";
import { countDiscoveriesAgainstSlice } from "../src/sliceCount.ts";

function discoveryFoundAt(foundAt: string): Discovery {
  return { id: "d1", what: "something the brief did not carry", foundAt, matteredBecause: "test" };
}

describe("countDiscoveriesAgainstSlice", () => {
  it("does not treat a dotted identifier as a file citation", () => {
    const slice = ["clock.now was called at line 12", "JSON.stringify serializes it"].join("\n");
    expect(
      countDiscoveriesAgainstSlice(slice, [
        discoveryFoundAt("clock.now"),
        discoveryFoundAt("JSON.stringify"),
        discoveryFoundAt("substrate.address"),
      ]),
    ).toEqual({ known: 0, unknown: 3 });
  });

  it("treats a bare filename with a closed-list extension as a real citation", () => {
    const slice = "- notes.yaml already lists this choice\n- see also package.json and AGENTS.md";
    expect(
      countDiscoveriesAgainstSlice(slice, [
        discoveryFoundAt("notes.yaml"),
        discoveryFoundAt("package.json"),
        discoveryFoundAt("AGENTS.md"),
      ]),
    ).toEqual({ known: 3, unknown: 0 });
  });

  it("treats any slashed path as a citation regardless of its extension", () => {
    const slice = "- packages/schemas/src/reference/diff.ts:43 already named";
    expect(
      countDiscoveriesAgainstSlice(slice, [
        discoveryFoundAt("packages/schemas/src/reference/diff.ts:43"),
      ]),
    ).toEqual({ known: 1, unknown: 0 });
  });

  it("matches a multi-dot filename whole, slashed or bare", () => {
    const slice = [
      "- packages/substrate/test/absorb.test.ts already covers the fallback",
      "- absorb.test.ts is the bare form of the same file",
    ].join("\n");
    expect(
      countDiscoveriesAgainstSlice(slice, [
        discoveryFoundAt("packages/substrate/test/absorb.test.ts:85-145"),
        discoveryFoundAt("absorb.test.ts"),
      ]),
    ).toEqual({ known: 2, unknown: 0 });
  });
});
