import {
  derivation,
  fold,
  gate,
  outcome,
  spend,
  type LedgerEvent,
  type Receipt,
} from "ledger";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { approvalState, computePosition } from "../src/position.ts";

const document: GraphDocument = {
  id: "demo",
  gates: [{ id: "approved", kind: "human" }],
  nodes: [
    { id: "a", dependsOn: [], gates: [{ id: "typecheck", kind: "command" }] },
    { id: "b", dependsOn: ["a"], gates: [] },
    { id: "c", dependsOn: ["a", "b"], gates: [] },
  ],
};

function receipt(gateId: string): Receipt {
  return {
    id: `receipt-${gateId}`,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    derivation: derivation.gate(gateId, "1", "runner"),
    proof: {},
  };
}

describe("computePosition", () => {
  it("shows a node with no upstream state as ready, and pending gates, when the projection knows nothing", () => {
    const position = computePosition(document, fold([]), "some-hash");
    const a = position.nodes.find((node) => node.id === "a");
    expect(a?.state).toEqual({ kind: "ready" });
    expect(a?.gates).toEqual([{ id: "typecheck", gate: gate.pending() }]);
  });

  it("blocks a node on every dependency that is not cleared, naming them", () => {
    const position = computePosition(document, fold([]), "some-hash");
    const b = position.nodes.find((node) => node.id === "b");
    expect(b?.state).toEqual({ kind: "blocked", on: ["a"] });
    const c = position.nodes.find((node) => node.id === "c");
    expect(c?.state).toEqual({ kind: "blocked", on: ["a", "b"] });
  });

  it("is ready once every dependency's outcome is cleared", () => {
    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: outcome.reset([]),
      },
    ];
    const cleared = fold([
      ...events,
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: { kind: "cleared", receipts: [] },
      },
    ]);
    const position = computePosition(document, cleared, "some-hash");
    expect(position.nodes.find((node) => node.id === "b")?.state).toEqual({
      kind: "ready",
    });
  });

  it("shows a node's own recorded outcome instead of computing ready/blocked", () => {
    const heldOutcome = outcome.held([], "gate failed", "retry", "flaky", 1000);
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: heldOutcome,
      },
    ]);
    const position = computePosition(document, projection, "some-hash");
    expect(position.nodes.find((node) => node.id === "a")?.state).toEqual({
      kind: "outcome",
      outcome: heldOutcome,
    });
  });

  it("reads a node's gate state from the projection where present", () => {
    const satisfied = gate.satisfied(receipt("typecheck"));
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "gate-moved",
        node: { graph: "demo", id: "a" },
        gate: "typecheck",
        to: satisfied,
      },
    ]);
    const position = computePosition(document, projection, "some-hash");
    expect(position.nodes.find((node) => node.id === "a")?.gates).toEqual([
      { id: "typecheck", gate: satisfied },
    ]);
  });

  it("is the graph document's declared node order, topologically", () => {
    const position = computePosition(document, fold([]), "some-hash");
    expect(position.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("computes the unweighted critical path over the document's own edges", () => {
    const position = computePosition(document, fold([]), "some-hash");
    expect(position.criticalPath).toEqual(["a", "b", "c"]);
  });

  it("reports not-approved when the graph pseudo-node carries no approved gate", () => {
    const position = computePosition(document, fold([]), "some-hash");
    expect(position.approval).toBe("not-approved");
  });

  it("reports approved when the graph's approved receipt id matches the current content hash", () => {
    const approvedReceipt = { ...receipt("approved"), id: "current-hash" };
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "demo" } },
      {
        kind: "gate-moved",
        node: { graph: "demo", id: "demo" },
        gate: "approved",
        to: gate.satisfied(approvedReceipt),
      },
    ]);
    const position = computePosition(document, projection, "current-hash");
    expect(position.approval).toBe("approved");
  });

  it("reports stale when the graph's approved receipt id no longer matches the current content hash", () => {
    const approvedReceipt = { ...receipt("approved"), id: "old-hash" };
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "demo" } },
      {
        kind: "gate-moved",
        node: { graph: "demo", id: "demo" },
        gate: "approved",
        to: gate.satisfied(approvedReceipt),
      },
    ]);
    const position = computePosition(document, projection, "new-hash");
    expect(position.approval).toBe("stale");
  });
});

describe("approvalState", () => {
  it("is not-approved when there is no gate at all", () => {
    expect(approvalState(undefined, "hash")).toBe("not-approved");
  });

  it("is not-approved for a pending or blocked gate", () => {
    expect(approvalState(gate.pending(), "hash")).toBe("not-approved");
    expect(approvalState(gate.blocked("evidence", "because"), "hash")).toBe(
      "not-approved",
    );
  });

  it("treats a waived approval the same as a satisfied one", () => {
    const waived = gate.waived("Rodrigo Sasaki", "policy", {
      ...receipt("approved"),
      id: "hash",
    });
    expect(approvalState(waived, "hash")).toBe("approved");
  });
});
