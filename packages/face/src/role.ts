import { err, ok, type Result } from "@phyxiusjs/fp";
import { nearestTerm } from "ledger";

export const NODE_ROLES = [
  "scout",
  "planner",
  "implementer",
  "tester",
  "reviewer",
  "verifier",
] as const;

export type NodeRole = (typeof NODE_ROLES)[number];

export function isNodeRole(value: unknown): value is NodeRole {
  return NODE_ROLES.some((role) => role === value);
}

export function parseNodeRole(word: string): Result<NodeRole, string> {
  if (isNodeRole(word)) return ok(word);
  const nearest = nearestTerm(word, NODE_ROLES);
  return err(
    `role "${word}" is not one of ${NODE_ROLES.join(", ")}; the nearest is "${nearest.term}"`,
  );
}
