import { isErr } from "@phyxiusjs/fp";
import {
  derivation,
  duration,
  fold,
  gate,
  spend,
  type LedgerEvent,
  type Receipt,
} from "ledger";
import { describe, expect, it } from "vitest";
import { loadGraphDocument } from "../src/document.ts";
import {
  renderGraphFrame,
  renderNodeFrame,
  renderPlansFrame,
} from "../src/frameRender.ts";
import { plansEntryOf } from "../src/plansEntry.ts";
import { positionOf, type PositionNode } from "../src/position.ts";
import { findRepoRoot, graphFilePath } from "../src/root.ts";

const repoRoot = findRepoRoot(import.meta.dirname);
if (repoRoot === undefined) {
  throw new Error(
    "frameRender.test.ts must run inside an interlock repository checkout",
  );
}
const root: string = repoRoot;
const GRAPH_ID = "0001-bootstrap";

function receiptFor(gateId: string): Receipt {
  return {
    id: `receipt-${gateId}`,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate(gateId, "1", "test"),
    proof: {},
  };
}

const LIVE_SESSION = "sess-live-1";

const fixtureEvents: readonly LedgerEvent[] = [
  {
    kind: "outcome-set",
    node: { graph: GRAPH_ID, id: "scaffold" },
    outcome: { kind: "cleared", receipts: [] },
  },
  {
    kind: "gate-moved",
    node: { graph: GRAPH_ID, id: "ledger" },
    gate: "replay",
    to: gate.satisfied(receiptFor("replay")),
  },
  {
    kind: "gate-moved",
    node: { graph: GRAPH_ID, id: "ledger" },
    gate: "illegal-states",
    to: gate.satisfied(receiptFor("illegal-states")),
  },
  {
    kind: "outcome-set",
    node: { graph: GRAPH_ID, id: "ledger" },
    outcome: {
      kind: "cleared",
      receipts: [receiptFor("replay"), receiptFor("illegal-states")],
    },
  },
  {
    kind: "gate-moved",
    node: { graph: GRAPH_ID, id: "ledger-gaps" },
    gate: "upcast-v1",
    to: gate.satisfied(receiptFor("upcast-v1")),
  },
  {
    kind: "outcome-set",
    node: { graph: GRAPH_ID, id: "ledger-gaps" },
    outcome: { kind: "cleared", receipts: [receiptFor("upcast-v1")] },
  },
  {
    kind: "gate-moved",
    node: { graph: GRAPH_ID, id: "runner-command-gate" },
    gate: "one-adapter",
    to: gate.blocked(
      "exit 1",
      "typecheck fails on a stray herdr socket reference",
    ),
  },
  {
    kind: "session-started",
    session: {
      id: LIVE_SESSION,
      node: { graph: GRAPH_ID, id: "runner-command-gate" },
    },
    brief: {
      graph: GRAPH_ID,
      node: "runner-command-gate",
      role: "worker",
      acceptance: "a fixture acceptance",
      gates: ["one-adapter", "receipt-idempotent"],
      scope: [],
    },
  },
  {
    kind: "lease-taken",
    node: { graph: GRAPH_ID, id: "runner-command-gate" },
    session: LIVE_SESSION,
    expiry: Date.now() + 60_000,
  },
];

async function loadRealDocument() {
  const document = await loadGraphDocument(graphFilePath(root, GRAPH_ID));
  if (isErr(document)) throw new Error(document.error.kind);
  return document.value;
}

function agentStatusFor(session: string): "working" | undefined {
  return session === LIVE_SESSION ? "working" : undefined;
}

function nodeIn(nodes: readonly PositionNode[], id: string): PositionNode {
  const found = nodes.find((node) => node.id === id);
  if (found === undefined) throw new Error(`no node "${id}" in position`);
  return found;
}

describe("frames over the real bootstrap graph", () => {
  it("renders a Plans-level row for the real graph with its approval, cleared count and live-session count", async () => {
    const document = await loadRealDocument();
    const projection = fold(fixtureEvents);
    const position = positionOf(
      document,
      projection,
      "some-hash",
      Date.now(),
      agentStatusFor,
    );
    const entry = plansEntryOf(position);
    const text = renderPlansFrame([entry], 0);

    expect(text).toBe(
      [
        "graphs",
        "",
        `> 0001-bootstrap — not approved — 3/${document.nodes.length} cleared — 1 live`,
      ].join("\n"),
    );
  });

  it("renders a Graph-level frame with a cursor and a live marker on the node with a live attempt", async () => {
    const document = await loadRealDocument();
    const projection = fold(fixtureEvents);
    const position = positionOf(
      document,
      projection,
      "some-hash",
      Date.now(),
      agentStatusFor,
    );
    const runnerIndex = position.nodes.findIndex(
      (node) => node.id === "runner-command-gate",
    );
    expect(runnerIndex).toBeGreaterThanOrEqual(0);

    const text = renderGraphFrame(position, runnerIndex);
    const lines = text.split("\n");

    expect(lines[0]).toBe("graph 0001-bootstrap — not approved");
    expect(lines).toContain("    scaffold — cleared");
    expect(lines).toContain("> ● runner-command-gate — ready");
    expect(text).toContain(
      "gates: one-adapter blocked, receipt-idempotent pending",
    );
    expect(text).toContain(
      "critical path: scaffold -> ledger -> ledger-gaps -> runner-command-gate",
    );
  });

  it("renders a Node-level frame with gate rows before attempt rows, cursor addressing either", async () => {
    const document = await loadRealDocument();
    const projection = fold(fixtureEvents);
    const position = positionOf(
      document,
      projection,
      "some-hash",
      Date.now(),
      agentStatusFor,
    );
    const runner = nodeIn(position.nodes, "runner-command-gate");

    const onGate = renderNodeFrame(runner, 0);
    expect(onGate.split("\n")).toEqual([
      "runner-command-gate — ready",
      "",
      "gates:",
      "> one-adapter — blocked (typecheck fails on a stray herdr socket reference)",
      "  receipt-idempotent — pending",
      "",
      "attempts:",
      `  ${LIVE_SESSION} — outcome no outcome yet, live lease, agent working`,
    ]);

    const onAttempt = renderNodeFrame(runner, 2);
    const attemptLine = onAttempt
      .split("\n")
      .find((line) => line.includes(LIVE_SESSION));
    expect(attemptLine?.startsWith(">")).toBe(true);
  });

  it("renders a Node-level frame with no gates and no attempts as explicit empty sections", () => {
    const scaffold: PositionNode = {
      id: "scaffold",
      dependsOn: [],
      state: { kind: "outcome", outcome: { kind: "cleared", receipts: [] } },
      gates: [],
      attempts: [],
      float: { kind: "unknown", because: "no receipt carries a duration" },
    };

    const text = renderNodeFrame(scaffold, 0);
    expect(text.split("\n")).toEqual([
      "scaffold — cleared",
      "",
      "gates:",
      "  (none declared)",
      "",
      "attempts:",
      "  (none)",
    ]);
  });
});

describe("plansEntryOf", () => {
  it("counts only genuinely live attempts, never an expired lease left on a session view", async () => {
    const document = await loadRealDocument();
    const staleLeaseEvents: readonly LedgerEvent[] = [
      ...fixtureEvents,
      {
        kind: "lease-expired",
        node: { graph: GRAPH_ID, id: "runner-command-gate" },
        session: LIVE_SESSION,
      },
    ];
    const projection = fold(staleLeaseEvents);
    const position = positionOf(
      document,
      projection,
      "some-hash",
      Date.now(),
      agentStatusFor,
    );
    expect(plansEntryOf(position).liveSessions).toBe(0);
  });

  it("counts a lease whose expiry has passed the clock as not live even when no sweeper ever recorded lease-expired", async () => {
    const document = await loadRealDocument();
    const now = Date.now();
    const unsweptSession = "sess-unswept-1";
    const unsweptEvents: readonly LedgerEvent[] = [
      {
        kind: "session-started",
        session: {
          id: unsweptSession,
          node: { graph: GRAPH_ID, id: "runner-command-gate" },
        },
        brief: {
          graph: GRAPH_ID,
          node: "runner-command-gate",
          role: "worker",
          acceptance: "a fixture acceptance",
          gates: [],
          scope: [],
        },
      },
      {
        kind: "lease-taken",
        node: { graph: GRAPH_ID, id: "runner-command-gate" },
        session: unsweptSession,
        expiry: now - 3_600_000,
      },
    ];
    const projection = fold(unsweptEvents);
    const position = positionOf(document, projection, "some-hash", now);
    expect(plansEntryOf(position).liveSessions).toBe(0);

    const runner = nodeIn(position.nodes, "runner-command-gate");
    const attemptLine = renderNodeFrame(runner, 0)
      .split("\n")
      .find((line) => line.includes(unsweptSession));
    expect(attemptLine).toContain("lease expired 1h ago");
    expect(attemptLine).not.toContain("live lease");
  });
});
