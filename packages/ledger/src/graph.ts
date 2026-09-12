import { isRecord, isString, prop } from "./validate.ts";

export interface Graph {
  readonly id: string;
}

export interface Node {
  readonly graph: string;
  readonly id: string;
}

export function isGraph(value: unknown): value is Graph {
  return isRecord(value) && isString(prop(value, "id"));
}

export function isNode(value: unknown): value is Node {
  return isRecord(value) && isString(prop(value, "graph")) && isString(prop(value, "id"));
}

export function nodeKey(node: Node): string {
  return `${node.graph}::${node.id}`;
}
