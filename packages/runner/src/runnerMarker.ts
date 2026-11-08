import { err, ok, type Result } from "@phyxiusjs/fp";

export const RUNNER_MARKER_KEYS: readonly [
  "INTERLOCK_SESSION",
  "INTERLOCK_GRAPH",
  "INTERLOCK_NODE",
] = ["INTERLOCK_SESSION", "INTERLOCK_GRAPH", "INTERLOCK_NODE"];

export interface RunnerMarker {
  readonly INTERLOCK_SESSION: string;
  readonly INTERLOCK_GRAPH: string;
  readonly INTERLOCK_NODE: string;
}

export interface MarkerConflict {
  readonly kind: "marker-conflict";
  readonly key: keyof RunnerMarker;
  readonly existing: string;
  readonly expected: string;
}

export function runnerMarker(session: string, graph: string, node: string): RunnerMarker {
  return {
    INTERLOCK_SESSION: session,
    INTERLOCK_GRAPH: graph,
    INTERLOCK_NODE: node,
  };
}

export function mergeRunnerMarker(
  environment: Readonly<Record<string, string>>,
  marker: RunnerMarker,
): Result<Readonly<Record<string, string>>, MarkerConflict> {
  for (const key of RUNNER_MARKER_KEYS) {
    const existing = environment[key];
    const expected = marker[key];
    if (existing !== undefined && existing !== expected) {
      return err({ kind: "marker-conflict", key, existing, expected });
    }
  }
  return ok({ ...environment, ...marker });
}
