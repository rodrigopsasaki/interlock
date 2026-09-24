import { type LedgerProjection, nodeKey, type Outcome } from "ledger";

export interface RuntimeAttempt {
  readonly session: string;
  readonly outcome: Outcome | undefined;
  readonly startedAtWallMs: number | undefined;
}

export function lastAttemptByRuntimeName(
  projection: LedgerProjection,
): ReadonlyMap<string, RuntimeAttempt> {
  const byName = new Map<string, RuntimeAttempt>();
  for (const session of projection.sessions.values()) {
    if (session.runtime === "unknown") continue;
    const nodeView = projection.nodes.get(nodeKey(session.node));
    const ownOutcome =
      nodeView?.outcome !== undefined && session.leaseGeneration === nodeView.outcomeSetAtGeneration
        ? nodeView.outcome
        : undefined;
    byName.set(session.runtime.name, {
      session: session.session,
      outcome: ownOutcome,
      startedAtWallMs: session.narration[0]?.at,
    });
  }
  return byName;
}
