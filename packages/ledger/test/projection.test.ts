import { describe, expect, it } from "vitest";
import type { Brief } from "../src/brief.js";
import { derivation } from "../src/derivation.js";
import type { LedgerEvent } from "../src/event.js";
import { gate } from "../src/gate.js";
import { nodeKey, type Node } from "../src/graph.js";
import { note } from "../src/note.js";
import { outcome } from "../src/outcome.js";
import { fold, isInterrupted } from "../src/projection.js";
import { duration, type Receipt } from "../src/receipt.js";
import { spend } from "../src/spend.js";

const node: Node = { graph: "0001-bootstrap", id: "ledger" };
const brief: Brief = {
  graph: "0001-bootstrap",
  node: "ledger",
  role: "worker",
  acceptance: "the ledger as a Phyxius journal",
  gates: ["replay", "unrepresentable"],
  scope: ["packages/ledger/src"],
};
const receipt: Receipt = {
  id: "receipt-1",
  gate: "typecheck",
  commitSha: "deadbeef",
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1", "runner"),
  proof: {},
};

describe("fold", () => {
  it("projects a node's gates, receipts and outcome from its events", () => {
    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node },
      {
        kind: "gate-moved",
        node,
        gate: "typecheck",
        to: gate.satisfied(receipt),
      },
      { kind: "receipt-written", node, receipt },
      {
        kind: "outcome-set",
        node,
        outcome: outcome.reset([receipt], "Rodrigo Sasaki", "flaky suite"),
      },
    ];
    const projection = fold(events);
    const view = projection.nodes.get(nodeKey(node));
    expect(view?.gates.get("typecheck")).toEqual(gate.satisfied(receipt));
    expect(view?.receipts).toEqual([receipt]);
    expect(view?.outcome).toEqual(
      outcome.reset([receipt], "Rodrigo Sasaki", "flaky suite"),
    );
  });

  it("projects a session's notes and lease from its events", () => {
    const events: readonly LedgerEvent[] = [
      { kind: "session-started", session: { id: "session-1", node }, brief },
      { kind: "lease-taken", node, session: "session-1", expiry: 30_000 },
      {
        kind: "note-appended",
        session: "session-1",
        note: note.surprise("2026-09-09T00:00:00Z", "x", "y"),
      },
    ];
    const projection = fold(events);
    const view = projection.sessions.get("session-1");
    expect(view?.notes).toHaveLength(1);
    expect(view?.lease?.expiry).toBe(30_000);
    expect(view?.debrief).toBeUndefined();
  });

  it("marks a session interrupted only when its lease expired with no debrief", () => {
    const started: readonly LedgerEvent[] = [
      { kind: "session-started", session: { id: "session-1", node }, brief },
      { kind: "lease-taken", node, session: "session-1", expiry: 30_000 },
    ];
    const stillWorking = fold(started).sessions.get("session-1");
    expect(stillWorking && isInterrupted(stillWorking)).toBe(false);

    const expired = fold([
      ...started,
      { kind: "lease-expired", node, session: "session-1" },
    ]).sessions.get("session-1");
    expect(expired && isInterrupted(expired)).toBe(true);

    const debriefed = fold([
      ...started,
      { kind: "lease-expired", node, session: "session-1" },
      {
        kind: "debrief-filed",
        session: "session-1",
        debrief: {
          graph: "0001-bootstrap",
          node: "ledger",
          role: "worker",
          graphBaseSha: "deadbeef",
          sessionStartSha: "deadbeef",
          headSha: "deadbeef",
          derivation: {
            kind: "agent",
            runtime: "claude-code",
            model: "claude-sonnet-5",
          },
          discoveries: [],
          decisions: [],
          gatesRunByAgent: [],
          open: [],
        },
      },
    ]).sessions.get("session-1");
    expect(debriefed && isInterrupted(debriefed)).toBe(false);
  });

  it("tracks each lease's own generation against the node's, so a stale outcome is tellable from a current one", () => {
    const firstLease: readonly LedgerEvent[] = [
      { kind: "session-started", session: { id: "session-1", node }, brief },
      { kind: "lease-taken", node, session: "session-1", expiry: 1_000 },
    ];
    const afterFirstLease = fold(firstLease);
    expect(afterFirstLease.nodes.get(nodeKey(node))?.leaseGeneration).toBe(1);
    expect(afterFirstLease.sessions.get("session-1")?.leaseGeneration).toBe(1);

    const afterFirstOutcome = fold([
      ...firstLease,
      {
        kind: "outcome-set",
        node,
        outcome: outcome.cancelled([], "sweeper", "expired"),
      },
    ]);
    expect(
      afterFirstOutcome.nodes.get(nodeKey(node))?.outcomeSetAtGeneration,
    ).toBe(1);

    const secondLease: readonly LedgerEvent[] = [
      { kind: "session-started", session: { id: "session-2", node }, brief },
      { kind: "lease-taken", node, session: "session-2", expiry: 2_000 },
    ];
    const afterSecondLease = fold([
      ...firstLease,
      {
        kind: "outcome-set",
        node,
        outcome: outcome.cancelled([], "sweeper", "expired"),
      },
      ...secondLease,
    ]);
    expect(afterSecondLease.nodes.get(nodeKey(node))?.leaseGeneration).toBe(2);
    expect(afterSecondLease.sessions.get("session-2")?.leaseGeneration).toBe(2);
    // The node's outcome still carries generation 1: it predates session-2's own lease.
    expect(
      afterSecondLease.nodes.get(nodeKey(node))?.outcomeSetAtGeneration,
    ).toBe(1);
  });
});
