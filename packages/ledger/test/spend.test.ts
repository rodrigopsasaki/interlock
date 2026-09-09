import { describe, expect, it } from "vitest";
import { isSpend, spend } from "../src/spend.js";

describe("spend", () => {
  it("builds none, metered and local", () => {
    expect(spend.none()).toEqual({ kind: "none" });
    expect(spend.metered(1500, 2)).toEqual({
      kind: "metered",
      amountUsdMicros: 1500,
      unmeteredCalls: 2,
    });
    expect(spend.local()).toEqual({ kind: "local" });
  });

  it("recognizes every closed arm", () => {
    expect(isSpend(spend.none())).toBe(true);
    expect(isSpend(spend.metered(0, 0))).toBe(true);
    expect(isSpend(spend.local())).toBe(true);
  });

  it("rejects a kind outside the closed set", () => {
    expect(isSpend({ kind: "priced" })).toBe(false);
    expect(isSpend({ kind: "metered", amountUsdMicros: 1 })).toBe(false);
  });
});
