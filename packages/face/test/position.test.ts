import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  note,
  outcome,
  type Receipt,
  sessionRuntime,
  spend,
  type WalkStep,
  walkFor,
} from "ledger";
import { acceptedForms, harnessVocabulary } from "verifier";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import type { LandedReader } from "../src/landed.ts";
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
    expect(position.interlock).toBe("position@v2");
  });

  it("shows a node with no upstream state as ready, and pending gates, when the projection knows nothing", () => {
    const position = positionOf(document, fold([]), "some-hash", Date.now());
    const a = nodeIn(position, "a");
    expect(a.state).toEqual({ kind: "ready" });
    expect(a.gates).toEqual([{ id: "typecheck", kind: "command", state: { kind: "pending" } }]);
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
        kind: "command",
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

describe("positionOf: what a blocked session asked, in its words", () => {
  const now = Date.parse("2026-11-05T02:00:00Z");
  const node = { graph: "demo", id: "a" };

  function liveSession(...after: LedgerEvent[]): LedgerEvent[] {
    return [
      { kind: "node-created", node },
      {
        kind: "session-started",
        session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
        brief: brief("a"),
        graphBaseSha: "deadbeef",
      },
      { kind: "lease-taken", node, session: "session-1", expiry: now + 60_000 },
      ...after,
    ];
  }

  function attemptOf(events: LedgerEvent[], status: "blocked" | "working") {
    const position = positionOf(document, fold(events), "some-hash", now, () => status);
    return nodeIn(position, "a").attempts[0];
  }

  const earlier = note.question("2026-11-05T01:00:00Z", "Which branch should I build on?");
  const latest = note.question("2026-11-05T01:30:00Z", "Merge the walk now?", ["yes", "no"]);

  it("shows the latest question's words, options and time when blocked with a question", () => {
    const attempt = attemptOf(
      liveSession(
        { kind: "note-appended", session: "session-1", note: earlier },
        {
          kind: "note-appended",
          session: "session-1",
          note: note.choice("2026-11-05T01:20:00Z", "kept the walk", "it reads"),
        },
        { kind: "note-appended", session: "session-1", note: latest },
      ),
      "blocked",
    );
    expect(attempt?.asking).toEqual({
      asked: "Merge the walk now?",
      options: ["yes", "no"],
      at: "2026-11-05T01:30:00Z",
    });
  });

  it("carries no options when the question named none", () => {
    const attempt = attemptOf(
      liveSession({ kind: "note-appended", session: "session-1", note: earlier }),
      "blocked",
    );
    expect(attempt?.asking).toEqual({
      asked: "Which branch should I build on?",
      at: "2026-11-05T01:00:00Z",
    });
  });

  it("shows null with the because and when blocked was observed when the session wrote no question", () => {
    const attempt = attemptOf(
      liveSession({
        kind: "note-appended",
        session: "session-1",
        note: note.choice("2026-11-05T01:20:00Z", "kept the walk", "it reads"),
      }),
      "blocked",
    );
    expect(attempt?.asking).toEqual({
      asked: null,
      because: "the session is blocked and wrote no question note before it stopped",
      at: "2026-11-05T02:00:00.000Z",
    });
  });

  it("carries no asking while the agent is working, even with a question on the record", () => {
    const attempt = attemptOf(
      liveSession({ kind: "note-appended", session: "session-1", note: latest }),
      "working",
    );
    expect(attempt?.agentStatus).toBe("working");
    expect(attempt).not.toHaveProperty("asking");
  });

  it("stops showing a question once the attempt ended, saying it counts as answered", () => {
    const attempt = attemptOf(
      liveSession(
        { kind: "note-appended", session: "session-1", note: latest },
        {
          kind: "outcome-set",
          node,
          outcome: { kind: "cleared", receipts: [receipt("typecheck")] },
        },
      ),
      "blocked",
    );
    expect(attempt?.outcome?.kind).toBe("cleared");
    expect(attempt?.asking).toEqual({
      asked: null,
      because:
        "the session is blocked, and its last question, at 2026-11-05T01:30:00Z, counts as answered because the attempt ended",
      at: "2026-11-05T02:00:00.000Z",
    });
  });

  it("carries no asking for an attempt whose lease is no longer live", () => {
    const position = positionOf(
      document,
      fold(liveSession({ kind: "note-appended", session: "session-1", note: latest })),
      "some-hash",
      now + 120_000,
      () => "blocked",
    );
    expect(nodeIn(position, "a").attempts[0]).not.toHaveProperty("asking");
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

describe("the line: where a graph stands, in one sentence and one voice", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  const claude = sessionRuntime.declared("claude", "claude-code", "claude-opus-5-5");
  const loom: GraphDocument = {
    id: "loom",
    ask: "One read carries everything a face needs.",
    gates: [{ id: "approved", kind: "human" }],
    nodes: [
      {
        id: "a",
        acceptance: "Do the first thing.",
        dependsOn: [],
        gates: [
          { id: "typecheck", kind: "command" },
          { id: "review", kind: "human" },
        ],
      },
      { id: "b", dependsOn: ["a"], gates: [{ id: "lint", kind: "command" }] },
    ],
  };
  const lone: GraphDocument = {
    id: "lone",
    gates: [],
    nodes: [{ id: "a", dependsOn: [], gates: [] }],
  };
  const aNode = { graph: "loom", id: "a" };
  const bNode = { graph: "loom", id: "b" };

  function approvedFor(graph: string): LedgerEvent[] {
    return [
      { kind: "node-created", node: { graph, id: graph } },
      {
        kind: "gate-moved",
        node: { graph, id: graph },
        gate: "approved",
        to: gate.satisfied({ ...receipt("approved"), id: "hash" }),
      },
    ];
  }

  function headReceipt(gateId: string, sha: string): Receipt {
    return { ...receipt(gateId), commitSha: sha };
  }

  function started(session: string, node: { graph: string; id: string }): LedgerEvent[] {
    return [
      {
        kind: "session-started",
        session: { id: session, node, runtime: claude },
        brief: { ...brief(node.id), graph: node.graph },
        graphBaseSha: "base",
      },
      { kind: "lease-taken", node, session, expiry: now + 60_000 },
    ];
  }

  function narrated(session: string, at: string, line: string): LedgerEvent {
    return { kind: "session-narrated", session, at: Date.parse(at), line };
  }

  function cleared(node: { graph: string; id: string }, sha: string): LedgerEvent {
    return {
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [headReceipt("typecheck", sha)] },
    };
  }

  const landedByHead: LandedReader = (head) => {
    if (head.kind === "unknown") return { kind: "unknown", because: head.because };
    switch (head.head) {
      case "on":
        return { kind: "on-main", main: "main", head: head.head, by: "ancestry" };
      case "off":
        return { kind: "not-on-main", main: "main", head: head.head };
      case "partly":
        return {
          kind: "partly-reverted-on-main",
          main: "main",
          head: head.head,
          reverted: ["c".repeat(40)],
          revertedBy: { ["c".repeat(40)]: "d".repeat(40) },
        };
      default:
        return { kind: "reverted-on-main", main: "main", head: head.head, revertedBy: "r" };
    }
  };

  function read(
    events: readonly LedgerEvent[],
    status?: "working" | "blocked",
    graph: GraphDocument = loom,
  ): Position {
    return positionOf(
      graph,
      fold(events),
      "hash",
      now,
      status === undefined ? undefined : () => status,
      landedByHead,
    );
  }

  const sentences: Array<[string, () => Position, string]> = [
    [
      "held at a named gate",
      () =>
        read([
          ...approvedFor("loom"),
          {
            kind: "gate-moved",
            node: aNode,
            gate: "typecheck",
            to: gate.blocked("exit 2", "typecheck failed"),
          },
          {
            kind: "outcome-set",
            node: aNode,
            outcome: outcome.held([], heldOn.gateFailure("typecheck", "retry"), "failed", now),
          },
        ]),
      "a held at gate typecheck",
    ],
    [
      "a session blocked with nothing newer to quote",
      () =>
        read(
          [
            ...approvedFor("loom"),
            ...started("s1", aNode),
            narrated("s1", "2026-11-05T11:00:00Z", "agent blocked; answer in pane p1: ?"),
          ],
          "blocked",
        ),
      "claude session blocked at a",
    ],
    [
      "a person's gate open on a node",
      () =>
        read([
          ...approvedFor("loom"),
          {
            kind: "gate-moved",
            node: aNode,
            gate: "typecheck",
            to: gate.satisfied(receipt("typecheck")),
          },
        ]),
      "human gate review pending at a",
    ],
    ["the graph not approved", () => read([]), "Drafted and waiting for your approval."],
    [
      "the graph's approval stale",
      () =>
        positionOf(
          loom,
          fold([
            { kind: "node-created", node: { graph: "loom", id: "loom" } },
            {
              kind: "gate-moved",
              node: { graph: "loom", id: "loom" },
              gate: "approved",
              to: gate.satisfied({ ...receipt("approved"), id: "old" }),
            },
          ]),
          "hash",
          now,
        ),
      "human gate approved stale at loom",
    ],
    ["ready to start", () => read(approvedFor("loom")), "a ready"],
    [
      "a runtime working a node, with how many gates are left",
      () =>
        read(
          [
            ...approvedFor("loom"),
            ...started("s1", aNode),
            narrated("s1", "2026-11-05T11:00:00Z", "agent working"),
          ],
          "working",
        ),
      "claude working a, 2 gates pending",
    ],
    [
      "waiting on a node that is not cleared",
      () =>
        read([
          ...approvedFor("loom"),
          {
            kind: "outcome-set",
            node: aNode,
            outcome: outcome.failed([], "gave up", "terminal-failure", "no budget"),
          },
        ]),
      "b blocked on a",
    ],
    [
      "an ended node",
      () =>
        read(
          [
            ...approvedFor("lone"),
            {
              kind: "outcome-set",
              node: { graph: "lone", id: "a" },
              outcome: { kind: "cancelled", receipts: [], authority: "Rodrigo", because: "moot" },
            },
          ],
          undefined,
          lone,
        ),
      "a cancelled",
    ],
    [
      "cleared and not on main",
      () => read([...approvedFor("loom"), cleared(aNode, "off"), cleared(bNode, "on")]),
      "a cleared, not on main",
    ],
    [
      "reverted on main",
      () => read([...approvedFor("loom"), cleared(aNode, "on"), cleared(bNode, "reverted")]),
      "b cleared, reverted on main",
    ],
    [
      "partly reverted on main",
      () => read([...approvedFor("loom"), cleared(aNode, "on"), cleared(bNode, "partly")]),
      "b cleared, partly reverted on main",
    ],
    [
      "done",
      () => read([...approvedFor("loom"), cleared(aNode, "on"), cleared(bNode, "on")]),
      "done",
    ],
  ];

  it("is not done while a node is partly reverted on main, though every node is cleared", () => {
    const position = read([...approvedFor("loom"), cleared(aNode, "on"), cleared(bNode, "partly")]);
    expect(nodeIn(position, "b").landed?.kind).toBe("partly-reverted-on-main");
    expect(position.done).toBe(false);
  });

  for (const [state, position, sentence] of sentences) {
    it(`says "${sentence}" when ${state}`, () => {
      expect(position().line).toEqual({ voice: "observed", text: sentence });
    });
  }

  const LINE_GRAMMAR_WORDS = ["at", "and", "for", "your"];

  it("speaks only vocabulary terms, the position's own words and the ids it names (I3)", () => {
    const repoRoot = join(import.meta.dirname, "../../..");
    const positionWords = new Set<string>();
    const read = new Set<string>();
    const collect = (value: unknown): void => {
      if (typeof value === "string") {
        for (const word of value.split(/[-@]/)) positionWords.add(word);
        return;
      }
      if (Array.isArray(value)) {
        for (const entry of value) collect(entry);
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, entry] of Object.entries(value)) {
        if (key === "enum" || key === "const") collect(entry);
        else if (key === "$ref" && typeof entry === "string" && entry.startsWith("parts/")) {
          collectFile(entry);
        } else if (typeof entry === "object") collect(entry);
      }
    };
    const collectFile = (path: string): void => {
      if (read.has(path)) return;
      read.add(path);
      const schema: unknown = JSON.parse(readFileSync(join(repoRoot, "schemas", path), "utf-8"));
      collect(schema);
    };
    collectFile("position@v2.json");
    const known = new Set([
      ...acceptedForms(harnessVocabulary(repoRoot)),
      ...positionWords,
      ...LINE_GRAMMAR_WORDS,
    ]);
    const ids = new Set(["a", "b", "loom", "lone", "typecheck", "review", "approved", "claude"]);
    for (const [, position] of sentences) {
      const line = position().line;
      if (line.voice !== "observed") throw new Error("expected an observed line");
      const unknownWords = line.text
        .split(/[\s,]+/)
        .map((word) => word.replace(/^[.,;:!?]+|[.,;:!?]+$/g, ""))
        .filter((word) => word.length > 0 && !ids.has(word) && !/^\d+$/.test(word))
        .filter((word) => !known.has(word.toLowerCase()));
      expect(unknownWords, line.text).toEqual([]);
    }
  });

  it("quotes the session's latest note exactly, in the said voice, when it is newer than the runner's last step", () => {
    const words = "kept the line in one module because every face reads it";
    const position = read(
      [
        ...approvedFor("loom"),
        ...started("s1", aNode),
        narrated("s1", "2026-11-05T11:00:00Z", "agent working"),
        {
          kind: "note-appended",
          session: "s1",
          note: note.choice("2026-11-05T11:30:00Z", words, "one owner"),
        },
      ],
      "working",
    );
    expect(position.line).toEqual({
      voice: "said",
      who: "claude",
      text: words,
      at: "2026-11-05T11:30:00Z",
    });
  });

  it("quotes a question in the said voice when the session asks after the runner's last step", () => {
    const position = read(
      [
        ...approvedFor("loom"),
        ...started("s1", aNode),
        narrated("s1", "2026-11-05T11:00:00Z", "agent working"),
        {
          kind: "note-appended",
          session: "s1",
          note: note.question("2026-11-05T11:40:00Z", "Merge now?", ["yes", "no"]),
        },
      ],
      "blocked",
    );
    expect(position.line).toEqual({
      voice: "said",
      who: "claude",
      text: "Merge now?",
      at: "2026-11-05T11:40:00Z",
    });
  });

  it("stays observed when the runner stepped after the session's latest note", () => {
    const position = read(
      [
        ...approvedFor("loom"),
        ...started("s1", aNode),
        {
          kind: "note-appended",
          session: "s1",
          note: note.choice("2026-11-05T10:00:00Z", "an older choice", "it was"),
        },
        narrated("s1", "2026-11-05T11:00:00Z", "agent working"),
      ],
      "working",
    );
    expect(position.line).toEqual({ voice: "observed", text: "claude working a, 2 gates pending" });
  });

  it("carries the ask, each gate's declared kind, each node's acceptance, its notes, and each attempt's said and runner steps", () => {
    const surprise = note.surprise("2026-11-05T11:10:00Z", "a string", "a number");
    const choice = note.choice("2026-11-05T11:20:00Z", "parsed it", "the schema says so");
    const position = read(
      [
        ...approvedFor("loom"),
        ...started("s1", aNode),
        narrated("s1", "2026-11-05T11:00:00Z", "leased a"),
        { kind: "note-appended", session: "s1", note: surprise },
        { kind: "note-appended", session: "s1", note: choice },
        narrated("s1", "2026-11-05T11:30:00Z", "agent working"),
      ],
      "working",
    );
    expect(position.ask).toBe("One read carries everything a face needs.");
    const a = nodeIn(position, "a");
    expect(a.acceptance).toBe("Do the first thing.");
    expect(a.gates.map((entry) => [entry.id, entry.kind])).toEqual([
      ["typecheck", "command"],
      ["review", "human"],
    ]);
    expect(a.notes).toEqual([surprise, choice]);
    expect(a.attempts[0]?.said).toEqual({
      kind: "choice",
      text: "parsed it",
      at: "2026-11-05T11:20:00Z",
    });
    expect(a.attempts[0]?.runner).toEqual([
      { at: Date.parse("2026-11-05T11:00:00Z"), line: "leased a" },
      { at: Date.parse("2026-11-05T11:30:00Z"), line: "agent working" },
    ]);
    expect(nodeIn(position, "b")).not.toHaveProperty("acceptance");
    expect(nodeIn(position, "b").notes).toEqual([]);
  });

  it("dates changedAt and sinceAt from named journal facts, and says unknown with a because when none exists", () => {
    const position = read(
      [
        ...approvedFor("loom"),
        ...started("s1", aNode),
        narrated("s1", "2026-11-05T11:00:00Z", "agent working"),
        {
          kind: "note-appended",
          session: "s1",
          note: note.choice("2026-11-05T11:20:00Z", "a choice", "a because"),
        },
      ],
      "working",
    );
    expect(position.changedAt).toEqual({
      kind: "known",
      at: Date.parse("2026-11-05T11:20:00Z"),
      fact: "note-appended",
    });
    expect(position.sinceAt).toEqual({
      kind: "known",
      at: Date.parse("2026-11-05T11:00:00Z"),
      fact: "session-narrated",
    });

    const untouched = read(approvedFor("loom"));
    expect(untouched.changedAt.kind).toBe("unknown");
    expect(untouched.sinceAt).toEqual({
      kind: "unknown",
      because: "a has no attempt, so no journal fact says when it entered this state",
    });
  });
});
