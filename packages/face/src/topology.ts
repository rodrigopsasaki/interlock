import { err, ok, type Result } from "@phyxiusjs/fp";
import type { NodeDeclaration } from "./document.ts";

export interface CycleRefusal {
  readonly kind: "cycle";
  readonly nodes: readonly string[];
}

export function topologicalOrder(
  nodes: readonly NodeDeclaration[],
): Result<readonly NodeDeclaration[], CycleRefusal> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Map(
    nodes.map((node) => [node.id, node.dependsOn.length]),
  );
  const dependents = new Map<string, string[]>();
  for (const node of nodes) {
    for (const dependsOn of node.dependsOn) {
      const list = dependents.get(dependsOn) ?? [];
      list.push(node.id);
      dependents.set(dependsOn, list);
    }
  }

  const queue = nodes
    .filter((node) => (remaining.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const seen = new Set<string>();
  const order: NodeDeclaration[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    if (node !== undefined) order.push(node);
    for (const dependent of dependents.get(id) ?? []) {
      const next = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  if (order.length < nodes.length) {
    const stuck = nodes
      .filter((node) => !seen.has(node.id))
      .map((node) => node.id);
    return err({ kind: "cycle", nodes: stuck });
  }
  return ok(order);
}
