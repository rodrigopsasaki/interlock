import {
  type Lease,
  type Ledger,
  type LedgerProjection,
  nodeKey,
  outcome,
  type SessionView,
} from "ledger";

export const ABANDONED_AUTHORITY = "sweeper";

export const HARNESS_AUTHORITIES: ReadonlySet<string> = new Set([ABANDONED_AUTHORITY]);

type ExpiredSession = SessionView & {
  readonly lease: Lease;
  readonly leaseGeneration: number;
};

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
