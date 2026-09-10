import { err, ok, type Result } from "@phyxiusjs/fp";
import type { GateDeclaration } from "face";
import type { Node } from "ledger";
import type { StandingGate } from "./standingGates.ts";

export type PlaceholderRefusal = {
  readonly kind: "unknown-placeholder";
  readonly token: string;
  readonly command: string;
};

const placeholders: ReadonlyMap<string, (node: Node) => string> = new Map([
  ["graph", (node: Node) => node.graph],
  ["node", (node: Node) => node.id],
]);

export function substituteGateCommand(
  command: string,
  node: Node,
): Result<string, PlaceholderRefusal> {
  let unknownToken: string | undefined;
  const substituted = command.replace(/\{(\w+)\}/g, (match, name: string) => {
    const resolve = placeholders.get(name);
    if (resolve === undefined) {
      unknownToken = name;
      return match;
    }
    return resolve(node);
  });
  return unknownToken === undefined
    ? ok(substituted)
    : err({ kind: "unknown-placeholder", token: unknownToken, command });
}

export function declaredGateIds(
  standing: readonly StandingGate[],
  node: readonly GateDeclaration[],
): readonly string[] {
  return [
    ...standing.map((entry) => entry.id),
    ...node.map((entry) => entry.id),
  ];
}

export function gateCommandTable(
  standing: readonly StandingGate[],
  node: readonly GateDeclaration[],
): ReadonlyMap<string, string> {
  const table = new Map<string, string>();
  for (const entry of standing) table.set(entry.id, entry.run);
  for (const entry of node) {
    if (entry.run !== undefined) table.set(entry.id, entry.run);
  }
  return table;
}
