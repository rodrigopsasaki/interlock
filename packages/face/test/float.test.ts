import { describe, expect, it } from "vitest";
import type { NodeDeclaration } from "../src/document.ts";
import { floatOf } from "../src/float.ts";
import type { NodeWeight } from "../src/weight.ts";

function node(id: string, dependsOn: readonly string[] = []): NodeDeclaration {
  return { id, dependsOn, gates: [] };
}

function measured(weights: Readonly<Record<string, number>>) {
  return (id: string): NodeWeight => ({
    kind: "measured",
    ms: weights[id] ?? 0,
  });
}

describe("floatOf", () => {
  it("gives a node with no idle branch to wait in a float of zero", () => {
    const ordered = [node("a"), node("b", ["a"]), node("c", ["b"])];
    const floats = floatOf(ordered, measured({ a: 10, b: 20, c: 5 }));
    expect(floats.get("a")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("b")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("c")).toEqual({ kind: "measured", ms: 0 });
  });

  it("gives slack to a branch shorter than its sibling, and none to the sibling that decides the finish", () => {
    const ordered = [
      node("start"),
      node("fast", ["start"]),
      node("slow", ["start"]),
      node("end", ["fast", "slow"]),
    ];
    const weightOf = measured({ start: 0, fast: 10, slow: 100, end: 5 });
    const floats = floatOf(ordered, weightOf);
    expect(floats.get("fast")).toEqual({ kind: "measured", ms: 90 });
    expect(floats.get("slow")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("start")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("end")).toEqual({ kind: "measured", ms: 0 });
  });

  it("shares one finish line across every sink, so a shorter dead-end branch gets real slack instead of a float of zero", () => {
    const ordered = [
      node("root"),
      node("orphan", ["root"]),
      node("longBranch", ["root"]),
      node("mainEnd", ["longBranch"]),
    ];
    const weightOf = measured({
      root: 0,
      orphan: 5,
      longBranch: 100,
      mainEnd: 0,
    });
    const floats = floatOf(ordered, weightOf);
    expect(floats.get("orphan")).toEqual({ kind: "measured", ms: 95 });
    expect(floats.get("mainEnd")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("longBranch")).toEqual({ kind: "measured", ms: 0 });
    expect(floats.get("root")).toEqual({ kind: "measured", ms: 0 });
  });

  it("is unknown for every node whose own weight is unmeasured, naming it", () => {
    const ordered = [node("a")];
    const floats = floatOf(ordered, () => ({
      kind: "unknown",
      because: "a: no outcome yet",
    }));
    expect(floats.get("a")).toEqual({
      kind: "unknown",
      because: "a: no outcome yet",
    });
  });

  it("propagates unknown backward from an unmeasured node onto every one of its ancestors", () => {
    const ordered = [node("a"), node("b", ["a"])];
    const weightOf = (id: string): NodeWeight =>
      id === "a" ? { kind: "measured", ms: 10 } : { kind: "unknown", because: "b: no outcome yet" };
    const floats = floatOf(ordered, weightOf);
    expect(floats.get("b")).toEqual({
      kind: "unknown",
      because: "b: no outcome yet",
    });
    expect(floats.get("a")).toEqual({
      kind: "unknown",
      because: "b: no outcome yet",
    });
  });

  it("propagates unknown forward from an unmeasured ancestor onto every one of its descendants", () => {
    const ordered = [node("a"), node("b", ["a"])];
    const weightOf = (id: string): NodeWeight =>
      id === "a" ? { kind: "unknown", because: "a: no outcome yet" } : { kind: "measured", ms: 10 };
    const floats = floatOf(ordered, weightOf);
    expect(floats.get("a")).toEqual({
      kind: "unknown",
      because: "a: no outcome yet",
    });
    expect(floats.get("b")).toEqual({
      kind: "unknown",
      because: "a: no outcome yet",
    });
  });
});
