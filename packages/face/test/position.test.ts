import {
  type Debrief,
  derivation,
  duration,
  fold,
  gate,
  heldOn,
  type LedgerEvent,
  type MarkCounts,
  NODE_ROLES,
  type NodeRole,
  outcome,
  type Receipt,
  sessionRuntime,
  spend,
  type WalkStep,
  walkFor,
} from "ledger";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { approvalState, type Position, type PositionNode, positionOf } from "../src/position.ts";

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
    const position = positionOf(document, fold([]), "some-hash", Date.now());
    expect(position.interlock).toBe("position@v1");
  });

  it("shows a node with no upstream state as ready, and pending gates, when the projection knows nothing", () => {
    const position = positionOf(document, fold([]), "some-hash", Date.now());
    const a = nodeIn(position, "a");
    expect(a.state).toEqual({ kind: "ready" });
    expect(a.gates).toEqual([{ id: "typecheck", state: { kind: "pending" } }]);
  });

  it("blocks a node on every dependency that is not cleared, naming them", () => {
    const position = positionOf(document, fold([]), "some-hash", Date.now());
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
    const position = positionOf(document, cleared, "some-hash", Date.now());
    expect(nodeIn(position, "b").state).toEqual({ kind: "ready" });
  });

  it("shows a node's own recorded outcome instead of computing ready/blocked", () => {
    const heldOutcome = outcome.held([], heldOn.gateFailure("gate failed", "retry"), "flaky", 1000);
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: heldOutcome,
      },
    ]);
    const position = positionOf(document, projection, "some-hash", Date.now());
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
    const position = positionOf(document, projection, "some-hash", Date.now());
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
    const position = positionOf(document, fold([]), "some-hash", Date.now());
    expect(position.nodes.map((node) => node.id)).toEqual(["a", "b", "c"]);
  });

  it("computes the unweighted critical path over the document's own edges when no receipt is measured", () => {
    const position = positionOf(document, fold([]), "some-hash", Date.now());
    expect(position.criticalPath).toEqual(["a", "b", "c"]);
  });

  it("reports not-approved when the graph pseudo-node carries no approved gate", () => {
    const position = positionOf(document, fold([]), "some-hash", Date.now());
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
    const position = positionOf(document, projection, "current-hash", Date.now());
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
    const position = positionOf(document, projection, "new-hash", Date.now());
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
        session: {
          id: "session-1",
          node: { graph: "demo", id: "a" },
          runtime: sessionRuntime.declared("luna", "claude", undefined),
        },
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
        session: {
          id: "session-2",
          node: { graph: "demo", id: "a" },
          runtime: sessionRuntime.unknown(),
        },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
    ]);
    const position = positionOf(document, projection, "some-hash", Date.now());
    const attempts = nodeIn(position, "a").attempts;
    expect(attempts.map((attempt) => attempt.runtime)).toEqual([
      sessionRuntime.declared("luna", "claude", undefined),
      "unknown",
    ]);
    expect(attempts.map((attempt) => attempt.session)).toEqual(["session-1", "session-2"]);
    expect(attempts[0]?.outcome).toEqual({
      kind: "cleared",
      receipts: [clearedReceipt],
    });
    expect(attempts[1]?.outcome).toBeUndefined();
  });

  it("resolves a live session's agent status through the supplied lookup, never guessing when it returns nothing", () => {
    const now = Date.now();
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      {
        kind: "session-started",
        session: {
          id: "session-1",
          node: { graph: "demo", id: "a" },
          runtime: sessionRuntime.unknown(),
        },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: now + 60_000,
      },
    ]);
    const withStatus = positionOf(document, projection, "some-hash", now, () => "working");
    expect(nodeIn(withStatus, "a").attempts[0]?.agentStatus).toBe("working");

    const withoutStatus = positionOf(document, projection, "some-hash", now, () => undefined);
    expect(nodeIn(withoutStatus, "a").attempts[0]?.agentStatus).toBeUndefined();

    const withoutLookup = positionOf(document, projection, "some-hash", now);
    expect(nodeIn(withoutLookup, "a").attempts[0]?.agentStatus).toBeUndefined();
  });
});

describe("positionOf: role", () => {
  it("carries the graph's role on its node and leaves it absent where the graph names none", () => {
    const roled: GraphDocument = {
      id: "demo",
      gates: [],
      nodes: [
        { id: "a", role: "implementer", dependsOn: [], gates: [] },
        { id: "b", dependsOn: ["a"], gates: [] },
      ],
    };
    const projection = fold([
      { kind: "node-created", node: { graph: "demo", id: "a" } },
      { kind: "node-created", node: { graph: "demo", id: "b" } },
    ]);
    const position = positionOf(roled, projection, "some-hash", Date.now());
    expect(nodeIn(position, "a").role).toBe("implementer");
    expect("role" in nodeIn(position, "b")).toBe(false);
  });
});

describe("positionOf: what a session was told and what it returned", () => {
  const SHA = "c".repeat(40);
  const node = { graph: "demo", id: "a" };
  const roled = (role: NodeRole | undefined, acceptance: string): GraphDocument => ({
    id: "demo",
    gates: [],
    nodes: [
      { id: "a", ...(role === undefined ? {} : { role }), acceptance, dependsOn: [], gates: [] },
    ],
  });
  const steps: readonly WalkStep[] = [
    { verb: "context", ask: "Which conventions govern these paths?" },
  ];
  const counts: MarkCounts = { rooted: 3, unrooted: 1, unexplained: 0, gap: 2 };

  const returned: Readonly<Record<NodeRole, Partial<Debrief>>> = {
    scout: {
      discoveries: [{ id: "x", what: "found", foundAt: "a.ts:1", matteredBecause: "unsaid" }],
    },
    planner: { graphFile: ".interlock/graphs/0047-next.yaml" },
    implementer: {
      decisions: [{ id: "d", what: "did", because: "why", restsOn: [], hunks: ["a.ts:1-2"] }],
    },
    tester: { proof: [{ test: "a.test.ts", pins: "the refusal" }] },
    reviewer: { findings: { lens: "security", items: [] } },
    verifier: { marks: [{ claim: "n/d", mark: "rooted", because: "its hunk is there" }] },
  };
  const kinds: Readonly<Record<NodeRole, readonly string[]>> = {
    scout: ["discoveries"],
    planner: ["graph"],
    implementer: ["decisions", "hunks"],
    tester: ["proof"],
    reviewer: ["findings"],
    verifier: ["marks"],
  };

  function debriefOf(role: string, sections: Partial<Debrief>): Debrief {
    return {
      graph: "demo",
      node: "a",
      role,
      graphBaseSha: SHA,
      sessionStartSha: SHA,
      headSha: SHA,
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      discoveries: [],
      decisions: [],
      gatesRunByAgent: [],
      open: [],
      ...sections,
    };
  }

  function started(role: string, acceptance: string, address?: string): LedgerEvent {
    return {
      kind: "session-started",
      session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
      brief: { graph: "demo", node: "a", role, acceptance, gates: [], scope: [] },
      graphBaseSha: SHA,
      ...(address === undefined ? {} : { walk: walkFor(address, steps) }),
    };
  }

  it.each(NODE_ROLES)(
    "shows a %s attempt's brief, walk and debrief without opening a file",
    (role) => {
      const position = positionOf(
        roled(role, "do it"),
        fold([
          { kind: "node-created", node },
          started(role, "do it", "https://substrate.test"),
          {
            kind: "debrief-filed",
            session: "session-1",
            debrief: debriefOf(role, returned[role]),
            markCounts: counts,
          },
        ]),
        "some-hash",
        Date.now(),
      );
      const attempt = nodeIn(position, "a").attempts[0];
      expect(attempt?.brief).toEqual({
        path: ".interlock/sessions/demo/a/brief.md",
        role,
        acceptance: "do it",
        walk: { kind: "address", address: "https://substrate.test", steps },
      });
      expect(attempt?.debrief).toEqual({
        path: ".interlock/sessions/demo/a/debrief.yaml",
        version: 1,
        kinds: kinds[role],
        marks: { kind: "counted", counts },
      });
    },
  );

  it.each(NODE_ROLES)(
    "shows a %s attempt's empty walk with its because when the address is none",
    (role) => {
      const position = positionOf(
        roled(role, "do it"),
        fold([{ kind: "node-created", node }, started(role, "do it", "none")]),
        "some-hash",
        Date.now(),
      );
      const attempt = nodeIn(position, "a").attempts[0];
      expect(attempt?.brief.walk).toEqual({
        kind: "none",
        because: "the substrate address is none, so there is nothing to ask",
      });
      expect(attempt?.debrief).toBeUndefined();
    },
  );

  it("carries the acceptance the stored session brief gave, never the graph's current text", () => {
    const position = positionOf(
      roled("implementer", "the acceptance as the graph reads now"),
      fold([
        { kind: "node-created", node },
        started("implementer", "the acceptance the session was given", "none"),
      ]),
      "some-hash",
      Date.now(),
    );
    expect(nodeIn(position, "a").attempts[0]?.brief.acceptance).toBe(
      "the acceptance the session was given",
    );
  });

  it("says why a brief has no walk: no role, or a session older than the recorded walk", () => {
    const roleless = positionOf(
      roled(undefined, "x"),
      fold([{ kind: "node-created", node }, started("worker", "x")]),
      "some-hash",
      Date.now(),
    );
    expect(nodeIn(roleless, "a").attempts[0]?.brief).toEqual({
      path: ".interlock/sessions/demo/a/brief.md",
      acceptance: "x",
      walk: { kind: "none", because: "the node names no role, so its brief carried no walk" },
    });

    const older = positionOf(
      roled("tester", "x"),
      fold([{ kind: "node-created", node }, started("tester", "x")]),
      "some-hash",
      Date.now(),
    );
    expect(nodeIn(older, "a").attempts[0]?.brief.walk).toEqual({
      kind: "none",
      because: "this session started before the journal recorded the walk a brief gave",
    });
  });

  it("counts each filing as the debrief's version and says when marks were not recorded", () => {
    const filed = (sections: Partial<Debrief>): LedgerEvent => ({
      kind: "debrief-filed",
      session: "session-1",
      debrief: debriefOf("implementer", sections),
    });
    const position = positionOf(
      roled("implementer", "x"),
      fold([
        { kind: "node-created", node },
        started("implementer", "x", "none"),
        filed({}),
        filed(returned.implementer),
      ]),
      "some-hash",
      Date.now(),
    );
    expect(nodeIn(position, "a").attempts[0]?.debrief).toEqual({
      path: ".interlock/sessions/demo/a/debrief.yaml",
      version: 2,
      kinds: ["decisions", "hunks"],
      marks: {
        kind: "unknown",
        because: "the verifier's marks were not recorded when it was filed",
      },
    });
  });
});

describe("approvalState", () => {
  it("is not-approved when there is no gate at all", () => {
    expect(approvalState(undefined, "hash")).toBe("not-approved");
  });

  it("is not-approved for a pending or blocked gate", () => {
    expect(approvalState(gate.pending(), "hash")).toBe("not-approved");
    expect(approvalState(gate.blocked("evidence", "because"), "hash")).toBe("not-approved");
  });

  it("treats a waived approval the same as a satisfied one", () => {
    const waived = gate.waived("Rodrigo Sasaki", "policy", {
      ...receipt("approved"),
      id: "hash",
    });
    expect(approvalState(waived, "hash")).toBe("approved");
  });
});
