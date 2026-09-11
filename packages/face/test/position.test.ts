import {
  derivation,
  duration,
  fold,
  gate,
  heldOn,
  outcome,
  spend,
  type LedgerEvent,
  type Receipt,
} from "ledger";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import {
  approvalState,
  positionOf,
  type Position,
  type PositionNode,
} from "../src/position.ts";

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
    duration: duration.unknown(),
    derivation: derivation.gate(gateId, "1", "runner"),
    proof: {},
  };
}

function brief(node: string) {
  return {
    graph: "demo",
    node,
    role: "worker",
    acceptance: "x",
    gates: [],
    scope: [],
  };
}

function nodeIn(position: Position, id: string): PositionNode {
  const found = position.nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`no node "${id}" in position`);
  return found;
}

describe("positionOf", () => {
  it("names the shape on every value it produces", () => {
    const position = positionOf(document, fold([]), "some-hash");
    expect(position.interlock).toBe("position@v1");
  });

  it("shows a node with no upstream state as ready, and pending gates, when the projection knows nothing", () => {
    const position = positionOf(document, fold([]), "some-hash");
    const a = nodeIn(position, "a");
    expect(a.state).toEqual({ kind: "ready" });
    expect(a.gates).toEqual([{ id: "typecheck", state: { kind: "pending" } }]);
  });

  it("blocks a node on every dependency that is not cleared, naming them", () => {
    const position = positionOf(document, fold([]), "some-hash");
    expect(nodeIn(position, "b").state).toEqual({
      kind: "blocked",
      on: ["a"],
    });
    expect(nodeIn(position, "c").state).toEqual({
      kind: "blocked",
      on: ["a", "b"],
    });
  });

  it("is ready once every dependency's outcome is cleared", () => {
    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: outcome.reset([], "Rodrigo Sasaki", "flaky suite"),
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
    const position = positionOf(document, cleared, "some-hash");
    expect(nodeIn(position, "b").state).toEqual({ kind: "ready" });
  });

  it("shows a node's own recorded outcome instead of computing ready/blocked", () => {
    const heldOutcome = outcome.held(
      [],
      heldOn.gateFailure("gate failed", "retry"),
      "flaky",
      1000,
    );
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: heldOutcome,
      },
    ]);
    const position = positionOf(document, projection, "some-hash");
    expect(nodeIn(position, "a").state).toEqual({
      kind: "outcome",
      outcome: heldOutcome,
    });
  });

  it("reads a node's gate state from the projection, splitting the receipt out as a summary", () => {
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
    const position = positionOf(document, projection, "some-hash");
    expect(nodeIn(position, "a").gates).toEqual([
      {
        id: "typecheck",
        state: { kind: "satisfied" },
        receipt: {
          id: "receipt-typecheck",
          commit: "deadbeef",
          duration: duration.unknown(),
          spend: spend.none(),
          derivation: "gate",
        },
      },
    ]);
  });

  it("is the graph document's declared node order, topologically", () => {
    const position = positionOf(document, fold([]), "some-hash");
    expect(position.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("computes the unweighted critical path over the document's own edges when no receipt is measured", () => {
    const position = positionOf(document, fold([]), "some-hash");
    expect(position.criticalPath).toEqual(["a", "b", "c"]);
  });

  it("reports not-approved when the graph pseudo-node carries no approved gate", () => {
    const position = positionOf(document, fold([]), "some-hash");
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
    const position = positionOf(document, projection, "current-hash");
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
    const position = positionOf(document, projection, "new-hash");
    expect(position.approval).toBe("stale");
  });

  it("carries every session as an attempt, joining the node's outcome only to the session that earned it", () => {
    const clearedReceipt = {
      ...receipt("typecheck"),
      duration: duration.measured(1000),
    };
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "session-started",
        session: { id: "session-1", node: { graph: "demo", id: "a" } },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: 1,
      },
      {
        kind: "lease-expired",
        node: { graph: "demo", id: "a" },
        session: "session-1",
      },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: { kind: "cleared", receipts: [clearedReceipt] },
      },
      {
        kind: "session-started",
        session: { id: "session-2", node: { graph: "demo", id: "a" } },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
    ]);
    const position = positionOf(document, projection, "some-hash");
    const attempts = nodeIn(position, "a").attempts;
    expect(attempts.map((attempt) => attempt.session)).toEqual([
      "session-1",
      "session-2",
    ]);
    expect(attempts[0]?.outcome).toEqual({
      kind: "cleared",
      receipts: [clearedReceipt],
    });
    expect(attempts[1]?.outcome).toBeUndefined();
  });

  it("resolves a live session's agent status through the supplied lookup, never guessing when it returns nothing", () => {
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "session-started",
        session: { id: "session-1", node: { graph: "demo", id: "a" } },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: 1,
      },
    ]);
    const withStatus = positionOf(
      document,
      projection,
      "some-hash",
      () => "working",
    );
    expect(nodeIn(withStatus, "a").attempts[0]?.agentStatus).toBe("working");

    const withoutStatus = positionOf(
      document,
      projection,
      "some-hash",
      () => undefined,
    );
    expect(nodeIn(withoutStatus, "a").attempts[0]?.agentStatus).toBeUndefined();

    const withoutLookup = positionOf(document, projection, "some-hash");
    expect(nodeIn(withoutLookup, "a").attempts[0]?.agentStatus).toBeUndefined();
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
