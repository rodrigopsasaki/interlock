import type { NodeDeclaration } from "./document.ts";

interface Chain {
  readonly hops: number;
  readonly weight: number | undefined;
}

function longer(a: Chain, b: Chain): boolean {
  if (a.weight !== undefined && b.weight !== undefined && a.weight !== b.weight)
    return a.weight > b.weight;
  return a.hops > b.hops;
}

export function criticalPath(
  topologicallyOrdered: readonly NodeDeclaration[],
  weightOf?: (id: string) => number | undefined,
): readonly string[] {
  const chain = new Map<string, Chain>();
  const predecessor = new Map<string, string>();
  const root: Chain = {
    hops: 0,
    weight: weightOf === undefined ? undefined : 0,
  };

  for (const node of topologicallyOrdered) {
    let best = root;
    let bestDependsOn: string | undefined;
    for (const dependsOn of node.dependsOn) {
      const candidate = chain.get(dependsOn) ?? root;
      if (longer(candidate, best)) {
        best = candidate;
        bestDependsOn = dependsOn;
      }
    }
    const ownWeight = weightOf?.(node.id);
    const combinedWeight =
      weightOf === undefined ||
      ownWeight === undefined ||
      best.weight === undefined
        ? undefined
        : ownWeight + best.weight;
    chain.set(node.id, { hops: best.hops + 1, weight: combinedWeight });
    if (bestDependsOn !== undefined) predecessor.set(node.id, bestDependsOn);
  }

  let endId: string | undefined;
  let endChain = root;
  for (const node of topologicallyOrdered) {
    const current = chain.get(node.id) ?? root;
    if (endId === undefined || longer(current, endChain)) {
      endChain = current;
      endId = node.id;
    }
  }
  if (endId === undefined) return [];

  const path: string[] = [];
  let current: string | undefined = endId;
  while (current !== undefined) {
    path.unshift(current);
    current = predecessor.get(current);
  }
  return path;
}
