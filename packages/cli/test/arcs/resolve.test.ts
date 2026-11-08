import { describe, expect, it } from "vitest";
import { isErr, isOk } from "@phyxiusjs/fp";
import { type GraphDocument } from "face";
import { admitGraph, resolveGraphArc } from "../../src/arcs/resolve.ts";
import { parseArcsRegistry } from "../../src/arcs/reader.ts";

function registry() {
  const result = parseArcsRegistry(
    {
      interlock: "arcs@v1",
      repository: "example",
      arcs: [
        { id: "a", title: "A", ask: "A", source: "chat", graphs: ["example/one"], superseded: [{ graph: "example/old", because: "replaced" }] },
        { id: "b", title: "B", ask: "B", source: "chat", graphs: ["example/two"] },
      ],
    },
    undefined,
  );
  if (isErr(result)) throw new Error(result.error);
  return result.value;
}

function graph(id: string, arc?: string): GraphDocument {
  return { id, ...(arc === undefined ? {} : { arc }), gates: [], nodes: [] };
}

describe("arc resolution", () => {
  it("resolves registry membership, key-only graphs, and history separately", () => {
    const arcs = registry();
    const listed = resolveGraphArc(arcs, graph("one"), "admission");
    expect(isOk(listed) && listed.value.id).toBe("a");

    const keyOnly = resolveGraphArc(arcs, graph("key-only", "b"), "admission");
    expect(isOk(keyOnly) && keyOnly.value.id).toBe("b");

    const superseded = resolveGraphArc(arcs, graph("old"), "admission");
    expect(isErr(superseded) && superseded.error).toContain("it was superseded in arc a: replaced");
    const history = resolveGraphArc(arcs, graph("old"), "history");
    expect(isOk(history) && history.value.id).toBe("a");
  });

  it("reports each conflict in the graph's plain refusal line", () => {
    const arcs = registry();
    const noArc = resolveGraphArc(arcs, graph("none"), "admission");
    expect(isErr(noArc) && noArc.error).toBe(
      "none has no arc: no arc in .interlock/arcs.yaml lists example/none, and the graph carries no arc key",
    );
    const unknownKey = resolveGraphArc(arcs, graph("none", "c"), "admission");
    expect(isErr(unknownKey) && unknownKey.error).toContain("arc key names c, which arcs.yaml does not hold");
    const mismatch = resolveGraphArc(arcs, graph("one", "b"), "admission");
    expect(isErr(mismatch) && mismatch.error).toContain("arc key says b, but arcs.yaml lists it under a");

    const duplicate = parseArcsRegistry(
      {
        interlock: "arcs@v1",
        repository: "example",
        arcs: [
          { id: "a", title: "A", ask: "A", source: "chat", graphs: ["example/one"] },
          { id: "b", title: "B", ask: "B", source: "chat", graphs: ["example/one"] },
        ],
      },
      undefined,
    );
    if (isErr(duplicate)) throw new Error(duplicate.error);
    const twoOwners = resolveGraphArc(duplicate.value, graph("one"), "history");
    expect(isErr(twoOwners) && twoOwners.error).toContain("lists it under two arcs, a and b");
  });

  it("constructs an admitted graph only from the admission reading", () => {
    const admitted = admitGraph(registry(), graph("one"));
    expect(isOk(admitted)).toBe(true);
    if (isOk(admitted)) expect(admitted.value.arc.id).toBe("a");
  });
});
