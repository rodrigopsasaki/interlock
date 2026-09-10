import type { GateDeclaration } from "face";
import type { StandingGate } from "./standingGates.ts";

// Three sources, add but never remove (AGENTS.md): standing gates come first, then the node's
// own, in that order -- a node may add to the table, never subtract from it.
export function declaredGateIds(
  standing: readonly StandingGate[],
  node: readonly GateDeclaration[],
): readonly string[] {
  return [
    ...standing.map((entry) => entry.id),
    ...node.map((entry) => entry.id),
  ];
}

export function gateCommandTable(
  standing: readonly StandingGate[],
  node: readonly GateDeclaration[],
): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const entry of standing) table.set(entry.id, entry.run);
  for (const entry of node) {
    if (entry.run !== undefined) table.set(entry.id, entry.run);
  }
  return table;
}
