import {
  derivation,
  duration,
  spend,
  type Outcome,
  type Receipt,
} from "ledger";
import { describe, expect, it } from "vitest";
import { nodeWeight } from "../src/weight.ts";

function receipt(ms: number | undefined): Receipt {
  return {
    id: "r",
    gate: "typecheck",
    commitSha: "deadbeef",
    spend: spend.none(),
    duration: ms === undefined ? duration.unknown() : duration.measured(ms),
    derivation: derivation.gate("typecheck", "1", "runner"),
    proof: {},
  };
}

describe("nodeWeight", () => {
  it("is unknown, naming the node, when there is no outcome yet", () => {
    expect(nodeWeight("a", undefined)).toEqual({
      kind: "unknown",
      because: "a: no outcome yet",
    });
  });

  it("is unknown when the outcome carries receipts but none is measured", () => {
    const outcome: Outcome = {
      kind: "cleared",
      receipts: [receipt(undefined)],
    };
    expect(nodeWeight("a", outcome)).toEqual({
      kind: "unknown",
      because: "a: no receipt in its outcome carries a measured duration",
    });
  });

  it("sums only the measured receipts, ignoring an unmeasured one beside them", () => {
    const outcome: Outcome = {
      kind: "cleared",
      receipts: [receipt(100), receipt(undefined), receipt(50)],
    };
    expect(nodeWeight("a", outcome)).toEqual({ kind: "measured", ms: 150 });
  });

  it("weighs a held outcome's receipts the same as a cleared one's", () => {
    const outcome: Outcome = {
      kind: "held",
      receipts: [receipt(20)],
      on: { kind: "decision", authority: "Rodrigo Sasaki" },
      because: "waiting on a person",
      expiry: 1,
    };
    expect(nodeWeight("a", outcome)).toEqual({ kind: "measured", ms: 20 });
  });
});
