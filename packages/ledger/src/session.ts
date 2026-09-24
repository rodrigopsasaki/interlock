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
  declared: (
    name: string,
    kind: string,
    model: string | undefined,
  ): SessionRuntime => ({
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
