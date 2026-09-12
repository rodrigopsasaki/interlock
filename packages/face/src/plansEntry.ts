import { isLiveAttempt } from "./nodeRow.ts";
import type { Position } from "./position.ts";

export interface PlansEntry {
  readonly graph: Position["graph"];
  readonly approval: Position["approval"];
  readonly cleared: number;
  readonly total: number;
  readonly liveSessions: number;
}

export function plansEntryOf(position: Position): PlansEntry {
  const cleared = position.nodes.filter(
    (node) => node.state.kind === "outcome" && node.state.outcome.kind === "cleared",
  ).length;
  const liveSessions = position.nodes.reduce(
    (count, node) => count + node.attempts.filter(isLiveAttempt).length,
    0,
  );
  return {
    graph: position.graph,
    approval: position.approval,
    cleared,
    total: position.nodes.length,
    liveSessions,
  };
}
