import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.ts";
import { fold } from "../src/projection.ts";
import type { Receipt } from "../src/receipt.ts";

const node = { graph: "demo", id: "a" };

function delegated(key: string, action: "approve" | "clear" | "publish" = "clear") {
  return derivation.delegated({
    who: "driver for owner",
    for: "owner",
    cite: `said:${key}`,
    citeKey: key,
    author: "owner",
    words: "words",
    at: "2026-11-08T00:00:00Z",
    reading: "reading",
    action,
    target: { graph: "demo", node: "a", gate: "witnessed" },
    contentHash: "hash",
  });
}

function receipt(key: string, action: "approve" | "clear" | "publish" = "clear"): Receipt {
  return {
    id: `receipt-${key}`,
    gate: "witnessed",
    commitSha: "commit",
    spend: { kind: "none" },
    duration: { kind: "unknown" },
    derivation: delegated(key, action),
    proof: {},
  };
}

describe("consumed cite projection", () => {
  it("keeps a gate-moved cite after pending, replacement, and retraction", () => {
    const first = receipt("first");
    const second = receipt("second");
    const projection = fold([
      { kind: "gate-moved", node, gate: "witnessed", to: { kind: "satisfied", receipt: first } },
      { kind: "gate-moved", node, gate: "witnessed", to: { kind: "pending" } },
      { kind: "gate-moved", node, gate: "witnessed", to: { kind: "satisfied", receipt: second } },
      { kind: "receipt-retracted", node, gate: "witnessed", receiptId: "receipt-second", by: "owner", because: "retract" },
      { kind: "receipt-written", node, receipt: { ...receipt("owner"), derivation: derivation.human("owner") } },
    ]);

    expect(projection.consumedCites.has("first")).toBe(true);
    expect(projection.consumedCites.has("second")).toBe(true);
    expect(projection.consumedCites.has("owner")).toBe(false);
  });

  it("records delegated receipts only carried by outcomes and outbox deliveries", () => {
    const outcomeReceipt = receipt("outcome");
    const deliveryDerivation = delegated("delivery", "publish");
    const projection = fold([
      {
        kind: "outcome-set",
        node,
        outcome: {
          kind: "held",
          receipts: [outcomeReceipt],
          on: { kind: "decision", authority: "owner" },
          because: "waiting",
          expiry: 0,
        },
      },
      {
        kind: "outbox-delivery-recorded",
        delivery: {
          id: "delivery",
          state: "uncertain",
          because: "waiting",
          derivation: deliveryDerivation,
        },
      },
    ]);

    expect(projection.consumedCites.get("outcome")?.action).toBe("clear");
    expect(projection.consumedCites.get("delivery")?.action).toBe("publish");
  });
});
