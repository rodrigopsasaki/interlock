import type { PositionAttempt } from "./attempts.ts";
import type { PositionGate } from "./positionGate.ts";
import type { PositionNode } from "./position.ts";

export type NodeRow =
  | { readonly kind: "gate"; readonly gate: PositionGate }
  | { readonly kind: "attempt"; readonly attempt: PositionAttempt };

export function nodeRowsOf(node: PositionNode): readonly NodeRow[] {
  return [
    ...node.gates.map((gate): NodeRow => ({ kind: "gate", gate })),
    ...node.attempts.map((attempt): NodeRow => ({ kind: "attempt", attempt })),
  ];
}

export function isLiveAttempt(attempt: PositionAttempt): boolean {
  return attempt.lease !== undefined && attempt.agentStatus !== undefined;
}
