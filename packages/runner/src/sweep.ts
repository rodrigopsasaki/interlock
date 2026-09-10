import {
  nodeKey,
  outcome,
  type Lease,
  type Ledger,
  type LedgerProjection,
  type SessionView,
} from "ledger";

export const ABANDONED_AUTHORITY = "sweeper";

type ExpiredSession = SessionView & { readonly lease: Lease };

// The ledger has no `abandoned` outcome kind (event@v2's Outcome union has six arms, not
// seven); adding a seventh is a shape change, not the additive-field case the runner is asked
// to route around instead of stopping for. `cancelled` already carries the shape abandonment
// needs -- receipts, authority, because -- so the sweeper writes cancelled with authority
// "sweeper" and records the missing outcome kind as an open item.
function isExpiredUnresolved(
  session: SessionView,
  projection: LedgerProjection,
  nowWallMs: number,
): session is ExpiredSession {
  const lease = session.lease;
  if (lease === undefined) return false;
  if (session.leaseExpired) return false;
  if (lease.expiry > nowWallMs) return false;
  return projection.nodes.get(nodeKey(session.node))?.outcome === undefined;
}

export function sweepExpiredLeases(
  ledger: Ledger,
  nowWallMs: number,
): readonly string[] {
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
    const receipts =
      ledger.projection().nodes.get(nodeKey(session.node))?.receipts ?? [];
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
