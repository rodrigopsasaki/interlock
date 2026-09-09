import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import { gate } from "../src/gate.js";
import { buildCleared, outcome } from "../src/outcome.js";
import type { Receipt } from "../src/receipt.js";
import { spend } from "../src/spend.js";

function receiptFor(gateId: string): Receipt {
  return {
    id: `receipt-${gateId}`,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    derivation: derivation.gate(gateId, "1", "runner"),
    proof: {},
  };
}

describe("buildCleared", () => {
  it("clears when every declared gate is satisfied or waived", () => {
    const gates = new Map([
      ["typecheck", gate.satisfied(receiptFor("typecheck"))],
      [
        "test",
        gate.waived("Rodrigo Sasaki", "known flaky suite", receiptFor("test")),
      ],
    ]);
    const result = buildCleared(["typecheck", "test"], gates);
    expect(result._tag).toBe("Ok");
    if (result._tag === "Ok") {
      expect(result.value).toEqual({
        kind: "cleared",
        receipts: [receiptFor("typecheck"), receiptFor("test")],
      });
    }
  });

  it("clears vacuously when no gates are declared", () => {
    const result = buildCleared([], new Map());
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "cleared", receipts: [] },
    });
  });
});

describe("outcome factories", () => {
  it("carries failure, disposition and because as three separate fields on held", () => {
    const held = outcome.held(
      [],
      "typecheck failed",
      "repair",
      "a real type error, not flaky",
      30_000,
    );
    expect(held).toEqual({
      kind: "held",
      receipts: [],
      failure: "typecheck failed",
      disposition: "repair",
      because: "a real type error, not flaky",
      expiry: 30_000,
    });
  });

  it("carries authority and because on cancelled and superseded", () => {
    expect(
      outcome.cancelled([], "Rodrigo Sasaki", "acceptance re-versioned"),
    ).toMatchObject({
      kind: "cancelled",
      authority: "Rodrigo Sasaki",
      because: "acceptance re-versioned",
    });
    expect(
      outcome.superseded([], "Rodrigo Sasaki", "acceptance re-versioned"),
    ).toMatchObject({
      kind: "superseded",
      authority: "Rodrigo Sasaki",
      because: "acceptance re-versioned",
    });
  });
});
