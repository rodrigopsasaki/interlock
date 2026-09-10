import { isErr, isOk } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import type { NodeDeclaration } from "../src/document.ts";
import { topologicalOrder } from "../src/topology.ts";

function node(id: string, dependsOn: readonly string[] = []): NodeDeclaration {
  return { id, dependsOn, gates: [] };
}

describe("topologicalOrder", () => {
  it("orders every dependency before its dependents", () => {
    const nodes = [
      node("self-run", ["face", "verifier-hunks"]),
      node("face", ["runner-command-gate", "face-read"]),
      node("verifier-hunks", ["debrief-schema", "runner-command-gate"]),
      node("face-read", ["ledger"]),
      node("debrief-schema", ["ledger"]),
      node("runner-command-gate", ["ledger"]),
      node("ledger", ["scaffold"]),
      node("scaffold", []),
    ];

    const ordered = topologicalOrder(nodes);
    expect(isOk(ordered)).toBe(true);
    if (!isOk(ordered)) return;

    const position = new Map(
      ordered.value.map((entry, index) => [entry.id, index]),
    );
    for (const declaration of nodes) {
      for (const dependsOn of declaration.dependsOn) {
        expect(position.get(dependsOn)).toBeLessThan(
          position.get(declaration.id) ?? -1,
        );
      }
    }
    expect(ordered.value).toHaveLength(nodes.length);
  });

  it("orders a graph with no edges in declared order", () => {
    const nodes = [node("a"), node("b"), node("c")];
    const ordered = topologicalOrder(nodes);
    expect(isOk(ordered)).toBe(true);
    if (isOk(ordered)) {
      expect(ordered.value.map((entry) => entry.id)).toEqual(["a", "b", "c"]);
    }
  });

  it("refuses a cycle, naming the nodes stuck in it", () => {
    const nodes = [node("a", ["b"]), node("b", ["c"]), node("c", ["a"])];
    const ordered = topologicalOrder(nodes);
    expect(isErr(ordered)).toBe(true);
    if (isErr(ordered)) {
      expect(new Set(ordered.error.nodes)).toEqual(new Set(["a", "b", "c"]));
    }
  });

  it("refuses only the nodes actually stuck in a cycle, not the whole graph", () => {
    const nodes = [node("free"), node("a", ["b"]), node("b", ["a"])];
    const ordered = topologicalOrder(nodes);
    expect(isErr(ordered)).toBe(true);
    if (isErr(ordered)) {
      expect(new Set(ordered.error.nodes)).toEqual(new Set(["a", "b"]));
    }
  });
});
