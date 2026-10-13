import { isDecided, type LedgerProjection, nodeKey, type Outcome } from "ledger";

function describeDecided(node: string, decided: Outcome): string {
  const by = "authority" in decided ? ` by ${decided.authority}` : "";
  const because = "because" in decided ? ` (${decided.because})` : "";
  const way =
    decided.kind === "cleared"
      ? "its proof is already held, so there is nothing to run"
      : "node reset refuses it, so run this work from a new graph version";
  return `${node}: outcome is ${decided.kind}${by}${because}, which is terminal; ${way}.`;
}

export function decidedNodeRefusal(
  graph: string,
  node: string,
  projection: LedgerProjection,
): string | undefined {
  const current = projection.nodes.get(nodeKey({ graph, id: node }))?.outcome;
  return current !== undefined && isDecided(current) ? describeDecided(node, current) : undefined;
}
