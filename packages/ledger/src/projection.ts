import type { Brief } from "./brief.ts";
import type { Debrief } from "./debrief.ts";
import type { LedgerEvent } from "./event.ts";
import type { Gate } from "./gate.ts";
import { nodeKey, type Node } from "./graph.ts";
import type { Lease } from "./lease.ts";
import type { Note } from "./note.ts";
import type { Outcome } from "./outcome.ts";
import type { Receipt } from "./receipt.ts";

export interface NodeView {
  readonly node: Node;
  readonly gates: ReadonlyMap<string, Gate>;
  readonly receipts: readonly Receipt[];
  readonly outcome: Outcome | undefined;
}

export interface SessionView {
  readonly session: string;
  readonly node: Node;
  readonly brief: Brief;
  readonly graphBaseSha: string | undefined;
  readonly notes: readonly Note[];
  readonly debrief: Debrief | undefined;
  readonly lease: Lease | undefined;
  readonly leaseExpired: boolean;
}

export interface LedgerProjection {
  readonly nodes: ReadonlyMap<string, NodeView>;
  readonly sessions: ReadonlyMap<string, SessionView>;
}

export function emptyProjection(): LedgerProjection {
  return { nodes: new Map(), sessions: new Map() };
}

// The harness never drafts a debrief on a session's behalf; it only records that one is missing.
export function isInterrupted(view: SessionView): boolean {
  return view.leaseExpired && view.debrief === undefined;
}

function emptyNodeView(node: Node): NodeView {
  return { node, gates: new Map(), receipts: [], outcome: undefined };
}

function withNode(
  projection: LedgerProjection,
  node: Node,
  update: (view: NodeView) => NodeView,
): LedgerProjection {
  const key = nodeKey(node);
  const current = projection.nodes.get(key) ?? emptyNodeView(node);
  const nodes = new Map(projection.nodes);
  nodes.set(key, update(current));
  return { ...projection, nodes };
}

function withSession(
  projection: LedgerProjection,
  sessionId: string,
  update: (view: SessionView) => SessionView,
): LedgerProjection {
  const current = projection.sessions.get(sessionId);
  if (current === undefined) return projection;
  const sessions = new Map(projection.sessions);
  sessions.set(sessionId, update(current));
  return { ...projection, sessions };
}

export function applyEvent(
  projection: LedgerProjection,
  event: LedgerEvent,
): LedgerProjection {
  switch (event.kind) {
    case "node-created":
      return withNode(projection, event.node, (view) => view);
    case "lease-taken": {
      const withNodeCreated = withNode(projection, event.node, (view) => view);
      return withSession(withNodeCreated, event.session, (view) => ({
        ...view,
        lease: {
          node: event.node,
          session: event.session,
          expiry: event.expiry,
        },
        leaseExpired: false,
      }));
    }
    case "lease-renewed":
      return withSession(projection, event.session, (view) => ({
        ...view,
        lease: {
          node: event.node,
          session: event.session,
          expiry: event.expiry,
        },
      }));
    case "lease-expired":
      return withSession(projection, event.session, (view) => ({
        ...view,
        leaseExpired: true,
      }));
    case "session-started": {
      const withNodeCreated = withNode(
        projection,
        event.session.node,
        (view) => view,
      );
      const sessions = new Map(withNodeCreated.sessions);
      sessions.set(event.session.id, {
        session: event.session.id,
        node: event.session.node,
        brief: event.brief,
        graphBaseSha: event.graphBaseSha,
        notes: [],
        debrief: undefined,
        lease: undefined,
        leaseExpired: false,
      });
      return { ...withNodeCreated, sessions };
    }
    case "note-appended":
      return withSession(projection, event.session, (view) => ({
        ...view,
        notes: [...view.notes, event.note],
      }));
    case "debrief-filed":
      return withSession(projection, event.session, (view) => ({
        ...view,
        debrief: event.debrief,
      }));
    case "gate-moved":
      return withNode(projection, event.node, (view) => {
        const gates = new Map(view.gates);
        gates.set(event.gate, event.to);
        return { ...view, gates };
      });
    case "receipt-written":
      return withNode(projection, event.node, (view) => ({
        ...view,
        receipts: [...view.receipts, event.receipt],
      }));
    case "outcome-set":
      return withNode(projection, event.node, (view) => ({
        ...view,
        outcome: event.outcome,
      }));
    case "outbox-intent-recorded":
      return withNode(projection, event.node, (view) => view);
  }
}

export function fold(events: Iterable<LedgerEvent>): LedgerProjection {
  let projection = emptyProjection();
  for (const event of events) projection = applyEvent(projection, event);
  return projection;
}
