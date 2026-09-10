import type { NodeDeclaration } from "./document.ts";

export function criticalPath(
  topologicallyOrdered: readonly NodeDeclaration[],
): readonly string[] {
  const chainLength = new Map<string, number>();
  const predecessor = new Map<string, string>();

  for (const node of topologicallyOrdered) {
    let best = 0;
    let bestDependsOn: string | undefined;
    for (const dependsOn of node.dependsOn) {
      const length = chainLength.get(dependsOn) ?? 0;
      if (length > best) {
        best = length;
        bestDependsOn = dependsOn;
      }
    }
    chainLength.set(node.id, best + 1);
    if (bestDependsOn !== undefined) predecessor.set(node.id, bestDependsOn);
  }

  let endId: string | undefined;
  let endLength = 0;
  for (const node of topologicallyOrdered) {
    const length = chainLength.get(node.id) ?? 0;
    if (length > endLength) {
      endLength = length;
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
