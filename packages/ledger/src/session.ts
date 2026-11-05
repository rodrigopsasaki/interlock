import { isNode, type Node } from "./graph.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type SessionRuntime =
  | {
      readonly name: string;
      readonly kind: string;
      readonly model: string | undefined;
    }
  | "unknown";

export const sessionRuntime = {
  declared: (name: string, kind: string, model: string | undefined): SessionRuntime => ({
    name,
    kind,
    model,
  }),
  unknown: (): SessionRuntime => "unknown",
};

export function isSessionRuntime(value: unknown): value is SessionRuntime {
  if (value === "unknown") return true;
  return (
    isRecord(value) &&
    isString(prop(value, "name")) &&
    isString(prop(value, "kind")) &&
    (prop(value, "model") === undefined || isString(prop(value, "model")))
  );
}

export interface Session {
  readonly id: string;
  readonly node: Node;
  readonly runtime: SessionRuntime;
}

export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isNode(prop(value, "node")) &&
    isSessionRuntime(prop(value, "runtime"))
  );
}

export type SessionStartedAt =
  | { readonly state: "known"; readonly epochMs: number }
  | { readonly state: "unknown"; readonly because: string };

export const UNRECORDED_START =
  "its session-started event records no start time, as a historical or backfilled session's does not";

export function isEpochMs(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function sessionStartedAt(epochMs: number | undefined): SessionStartedAt {
  return epochMs === undefined
    ? { state: "unknown", because: UNRECORDED_START }
    : { state: "known", epochMs };
}
