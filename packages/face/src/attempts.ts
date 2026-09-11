import {
  leaseIsLive,
  nodeKey,
  type LedgerProjection,
  type Outcome,
} from "ledger";
import type { AgentStatus } from "./agentStatus.ts";
import { leaseStateOf, type LeaseState } from "./leaseState.ts";

export interface PositionAttempt {
  readonly session: string;
  readonly outcome?: Outcome;
  readonly leaseState: LeaseState;
  readonly agentStatus?: AgentStatus;
}

export function attemptsFor(
  graph: string,
  node: string,
  projection: LedgerProjection,
  nowWallMs: number,
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
    const isLive = leaseIsLive(session, nowWallMs);
    const agentStatus = isLive ? agentStatusFor?.(session.session) : undefined;

    attempts.push({
      session: session.session,
      ...(ownOutcome === undefined ? {} : { outcome: ownOutcome }),
      leaseState: leaseStateOf(session, nowWallMs),
      ...(agentStatus === undefined ? {} : { agentStatus }),
    });
  }
  return attempts;
}
