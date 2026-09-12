import {
  type Lease,
  type Ledger,
  type LedgerProjection,
  nodeKey,
  outcome,
  type SessionView,
} from "ledger";

export const ABANDONED_AUTHORITY = "sweeper";

type ExpiredSession = SessionView & {
  readonly lease: Lease;
  readonly leaseGeneration: number;
};

// The ledger has no abandoned outcome kind yet, so the sweeper writes cancelled with authority
// "sweeper". A node's outcome is one value, not one per session, so a session is unresolved
// unless the node's outcome was set at or after its own lease — an earlier session's dead lease
// otherwise reads as resolved forever, once any later outcome lands on the shared node.
function isExpiredUnresolved(
  session: SessionView,
  projection: LedgerProjection,
  nowWallMs: number,
): session is ExpiredSession {
  const { lease, leaseGeneration } = session;
  if (lease === undefined || leaseGeneration === undefined) return false;
  if (session.leaseExpired) return false;
  if (lease.expiry > nowWallMs) return false;
  const outcomeGeneration = projection.nodes.get(nodeKey(session.node))?.outcomeSetAtGeneration;
  return outcomeGeneration === undefined || outcomeGeneration < leaseGeneration;
}

export function sweepExpiredLeases(ledger: Ledger, nowWallMs: number): readonly string[] {
  const projection = ledger.projection();
  const expired = [...projection.sessions.values()]
    .filter((session): session is ExpiredSession =>
      isExpiredUnresolved(session, projection, nowWallMs),
    )
    .sort((a, b) => a.session.localeCompare(b.session));

  for (const session of expired) {
    ledger.append({
      kind: "lease-expired",
      node: session.node,
      session: session.session,
    });
    const receipts = ledger.projection().nodes.get(nodeKey(session.node))?.receipts ?? [];
    ledger.append({
      kind: "outcome-set",
      node: session.node,
      outcome: outcome.cancelled(
        receipts,
        ABANDONED_AUTHORITY,
        `lease ${session.session} expired at ${session.lease.expiry} with no outcome`,
      ),
    });
  }

  return expired.map((session) => session.session);
}
