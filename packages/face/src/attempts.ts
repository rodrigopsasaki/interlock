import {
  nodeKey,
  type Lease,
  type LedgerProjection,
  type Outcome,
} from "ledger";
import type { AgentStatus } from "./agentStatus.ts";

export interface PositionAttempt {
  readonly session: string;
  readonly outcome?: Outcome;
  readonly lease?: Lease;
  readonly agentStatus?: AgentStatus;
}

export function attemptsFor(
  graph: string,
  node: string,
  projection: LedgerProjection,
  agentStatusFor?: (session: string) => AgentStatus | undefined,
): readonly PositionAttempt[] {
  const nodeView = projection.nodes.get(nodeKey({ graph, id: node }));
  const attempts: PositionAttempt[] = [];
  for (const session of projection.sessions.values()) {
    if (session.node.graph !== graph || session.node.id !== node) continue;

    const ownOutcome =
      nodeView?.outcome !== undefined &&
      session.leaseGeneration === nodeView.outcomeSetAtGeneration
        ? nodeView.outcome
        : undefined;
    const isLive = session.lease !== undefined && !session.leaseExpired;
    const agentStatus = isLive ? agentStatusFor?.(session.session) : undefined;

    attempts.push({
      session: session.session,
      ...(ownOutcome === undefined ? {} : { outcome: ownOutcome }),
      ...(session.lease === undefined ? {} : { lease: session.lease }),
      ...(agentStatus === undefined ? {} : { agentStatus }),
    });
  }
  return attempts;
}
