import { unwrap } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { criticalPath } from "../src/criticalPath.ts";
import type { NodeDeclaration } from "../src/document.ts";
import { topologicalOrder } from "../src/topology.ts";

function node(id: string, dependsOn: readonly string[] = []): NodeDeclaration {
  return { id, dependsOn, gates: [] };
}

function orderedNodes(
  nodes: readonly NodeDeclaration[],
): readonly NodeDeclaration[] {
  return unwrap(topologicalOrder(nodes));
}

describe("criticalPath", () => {
  it("is the single node's own chain when there is one node", () => {
    expect(criticalPath(orderedNodes([node("only")]))).toEqual(["only"]);
  });

  it("is the unweighted longest dependency chain by node count, not the widest fan-out", () => {
    const nodes = [
      node("a"),
      node("b", ["a"]),
      node("c", ["b"]),
      node("wide1", ["a"]),
      node("wide2", ["a"]),
      node("wide3", ["a"]),
    ];
    expect(criticalPath(orderedNodes(nodes))).toEqual(["a", "b", "c"]);
  });

  it("matches the bootstrap graph's own five-node chain", () => {
    const nodes = [
      node("scaffold"),
      node("ledger", ["scaffold"]),
      node("runner-command-gate", ["ledger"]),
      node("debrief-schema", ["ledger"]),
      node("verifier-hunks", ["debrief-schema", "runner-command-gate"]),
      node("face-read", ["ledger"]),
      node("face", ["runner-command-gate", "face-read"]),
      node("self-run", ["face", "verifier-hunks"]),
    ];
    expect(criticalPath(orderedNodes(nodes))).toEqual([
      "scaffold",
      "ledger",
      "runner-command-gate",
      "face",
      "self-run",
    ]);
  });

  it("is empty for an empty graph", () => {
    expect(criticalPath([])).toEqual([]);
  });

  it("picks the heavier branch by weight even when it has fewer hops", () => {
    const nodes = [
      node("start"),
      node("shortHeavy", ["start"]),
      node("longLight1", ["start"]),
      node("longLight2", ["longLight1"]),
      node("end", ["shortHeavy", "longLight2"]),
    ];
    const weights: Record<string, number> = {
      start: 0,
      shortHeavy: 1000,
      longLight1: 1,
      longLight2: 1,
      end: 0,
    };
    expect(criticalPath(orderedNodes(nodes), (id) => weights[id])).toEqual([
      "start",
      "shortHeavy",
      "end",
    ]);
  });

  it("falls back to the unweighted hop count when a branch's weight is not fully known", () => {
    const nodes = [
      node("start"),
      node("unmeasuredHeavy", ["start"]),
      node("longLight1", ["start"]),
      node("longLight2", ["longLight1"]),
      node("end", ["unmeasuredHeavy", "longLight2"]),
    ];
    const weights: Record<string, number> = {
      start: 0,
      longLight1: 1,
      longLight2: 1,
      end: 0,
    };
    expect(criticalPath(orderedNodes(nodes), (id) => weights[id])).toEqual([
      "start",
      "longLight1",
      "longLight2",
      "end",
    ]);
  });
});
