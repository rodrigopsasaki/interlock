import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import { gate, isGate, proposeGateMove } from "../src/gate.js";
import { duration, type Receipt } from "../src/receipt.js";
import { spend } from "../src/spend.js";

const receipt: Receipt = {
  id: "abc123",
  gate: "typecheck",
  commitSha: "deadbeef",
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1", "runner"),
  proof: {},
};

describe("gate", () => {
  it("builds every state in the closed set", () => {
    expect(isGate(gate.pending())).toBe(true);
    expect(isGate(gate.satisfied(receipt))).toBe(true);
    expect(isGate(gate.blocked("ci is red", "flaky network"))).toBe(true);
    expect(isGate(gate.waived("Rodrigo Sasaki", "known flaky suite", receipt))).toBe(true);
    expect(isGate(gate.superseded("Rodrigo Sasaki", "replaced by a stricter gate"))).toBe(true);
  });

  it("keeps an absent gate (pending) distinct from a satisfied one with an empty proof", () => {
    const emptyProofReceipt: Receipt = { ...receipt, proof: {} };
    const pending = gate.pending();
    const satisfied = gate.satisfied(emptyProofReceipt);
    expect(pending.kind).toBe("pending");
    expect(satisfied.kind).toBe("satisfied");
    expect(satisfied.kind === "satisfied" && satisfied.receipt.proof).toEqual({});
  });

  it("allows a pending gate to move within the node's declared set", () => {
    const moved = proposeGateMove(
      ["typecheck"],
      "typecheck",
      gate.pending(),
      gate.satisfied(receipt),
    );
    expect(moved._tag).toBe("Ok");
  });
});
