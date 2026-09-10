import { nodeKey, type LedgerProjection } from "ledger";

export function unmetDependencies(
  graph: string,
  dependsOn: readonly string[],
  projection: LedgerProjection,
): readonly string[] {
  return dependsOn.filter(
    (id) =>
      projection.nodes.get(nodeKey({ graph, id }))?.outcome?.kind !== "cleared",
  );
}
