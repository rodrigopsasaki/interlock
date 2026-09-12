import { isNode, type Node } from "./graph.ts";
import { isRecord, isString, prop } from "./validate.ts";

export interface Session {
  readonly id: string;
  readonly node: Node;
}

export function isSession(value: unknown): value is Session {
  return isRecord(value) && isString(prop(value, "id")) && isNode(prop(value, "node"));
}
