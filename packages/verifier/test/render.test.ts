import { derivation, mark } from "ledger";
import { describe, expect, it } from "vitest";
import { renderVerification } from "../src/render.ts";

const D = derivation.gate("verifier-hunks", "verifier@0", "test");

describe("renderVerification", () => {
  it("prints counts per kind, then each unrooted and unexplained mark", () => {
    const rendered = renderVerification({
      marks: [
        mark.rooted(D, "a.ts:1-2"),
        mark.unrooted(D, "b.ts is not a file changed in this range"),
        mark.unexplained(D, "c.ts"),
        mark.gap(D, { term: "Frobnicator", nearest: "for", difference: "x" }),
      ],
    });

    const lines = rendered.split("\n");
    expect(lines[0]).toBe("rooted 1, unrooted 1, unexplained 1, gap 1");
    expect(lines).toContain("unrooted: b.ts is not a file changed in this range");
    expect(lines).toContain('unexplained: "c.ts" -- expected a decision citing it');
    expect(lines).toHaveLength(3);
  });

  it("prints the zero line for a debrief with no marks", () => {
    expect(renderVerification({ marks: [] })).toBe("rooted 0, unrooted 0, unexplained 0, gap 0");
  });
});
