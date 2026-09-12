import type { NodeDeclaration } from "./document.ts";
import type { NodeWeight } from "./weight.ts";

export type Float =
  | { readonly kind: "measured"; readonly ms: number }
  | { readonly kind: "unknown"; readonly because: string };

interface Timing {
  readonly ms: number | undefined;
  readonly because: string | undefined;
}

function known(ms: number): Timing {
  return { ms, because: undefined };
}

function unknownAt(because: string): Timing {
  return { ms: undefined, because };
}

function latestOf(timings: readonly Timing[]): Timing {
  let best = known(0);
  for (const timing of timings) {
    if (timing.ms === undefined) return timing;
    if (timing.ms > (best.ms ?? 0)) best = timing;
  }
  return best;
}

function earliestFinish(
  ordered: readonly NodeDeclaration[],
  weightOf: (id: string) => NodeWeight,
): ReadonlyMap<string, Timing> {
  const ef = new Map<string, Timing>();
  for (const node of ordered) {
    const own = weightOf(node.id);
    if (own.kind === "unknown") {
      ef.set(node.id, unknownAt(own.because));
      continue;
    }
    const predecessorFinish = latestOf(node.dependsOn.map((id) => ef.get(id) ?? known(0)));
    ef.set(
      node.id,
      predecessorFinish.ms === undefined ? predecessorFinish : known(own.ms + predecessorFinish.ms),
    );
  }
  return ef;
}

function dependentsOf(ordered: readonly NodeDeclaration[]): ReadonlyMap<string, readonly string[]> {
  const dependents = new Map<string, string[]>();
  for (const node of ordered) {
    for (const dependsOn of node.dependsOn) {
      const list = dependents.get(dependsOn) ?? [];
      list.push(node.id);
      dependents.set(dependsOn, list);
    }
  }
  return dependents;
}

function makespanOf(
  ordered: readonly NodeDeclaration[],
  dependents: ReadonlyMap<string, readonly string[]>,
  ef: ReadonlyMap<string, Timing>,
): Timing {
  const sinks = ordered.filter((node) => (dependents.get(node.id) ?? []).length === 0);
  return latestOf(sinks.map((node) => ef.get(node.id) ?? unknownAt(`${node.id}: no outcome yet`)));
}

function latestFinish(
  ordered: readonly NodeDeclaration[],
  weightOf: (id: string) => NodeWeight,
  ef: ReadonlyMap<string, Timing>,
): ReadonlyMap<string, Timing> {
  const dependents = dependentsOf(ordered);
  const makespan = makespanOf(ordered, dependents, ef);
  const lf = new Map<string, Timing>();
  for (const node of [...ordered].reverse()) {
    const dependentIds = dependents.get(node.id) ?? [];
    if (dependentIds.length === 0) {
      lf.set(node.id, makespan);
      continue;
    }
    const bounds = dependentIds.map((dependentId): Timing => {
      const dependentLf = lf.get(dependentId) ?? unknownAt(`${dependentId}: no outcome yet`);
      if (dependentLf.ms === undefined) return dependentLf;
      const dependentWeight = weightOf(dependentId);
      return dependentWeight.kind === "unknown"
        ? unknownAt(dependentWeight.because)
        : known(dependentLf.ms - dependentWeight.ms);
    });
    const firstUnknown = bounds.find((bound) => bound.ms === undefined);
    lf.set(
      node.id,
      firstUnknown ??
        bounds.reduce((tightest, bound) =>
          (bound.ms ?? 0) < (tightest.ms ?? 0) ? bound : tightest,
        ),
    );
  }
  return lf;
}

export function floatOf(
  ordered: readonly NodeDeclaration[],
  weightOf: (id: string) => NodeWeight,
): ReadonlyMap<string, Float> {
  const ef = earliestFinish(ordered, weightOf);
  const lf = latestFinish(ordered, weightOf, ef);
  const floats = new Map<string, Float>();
  for (const node of ordered) {
    const start = ef.get(node.id) ?? unknownAt(`${node.id}: no outcome yet`);
    if (start.ms === undefined) {
      floats.set(node.id, {
        kind: "unknown",
        because: start.because ?? `${node.id}: no outcome yet`,
      });
      continue;
    }
    const end = lf.get(node.id) ?? unknownAt(`${node.id}: no outcome yet`);
    if (end.ms === undefined) {
      floats.set(node.id, {
        kind: "unknown",
        because: end.because ?? `${node.id}: no outcome yet`,
      });
      continue;
    }
    floats.set(node.id, { kind: "measured", ms: end.ms - start.ms });
  }
  return floats;
}
