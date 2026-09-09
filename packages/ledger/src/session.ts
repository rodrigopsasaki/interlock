import { isNode, type Node } from "./graph.js";
import { isRecord, isString, prop } from "./validate.js";

export interface Session {
  readonly id: string;
  readonly node: Node;
}

export function isSession(value: unknown): value is Session {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isNode(prop(value, "node"))
  );
}
