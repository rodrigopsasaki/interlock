import { type Debrief, type DebriefKind, debriefKindsPresent, type NodeRole } from "ledger";
import type { RoleEntry } from "./roles.ts";

function listed(kinds: readonly DebriefKind[]): string {
  if (kinds.length <= 1) return kinds.join("");
  return `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`;
}

function article(role: NodeRole): string {
  return /^[aeiou]/.test(role) ? "an" : "a";
}

export function roleKindsPresent(
  debrief: Debrief,
  graphFileExists: (path: string) => boolean,
): readonly DebriefKind[] {
  return debriefKindsPresent(debrief).filter(
    (kind) =>
      kind !== "graph" || (debrief.graphFile !== undefined && graphFileExists(debrief.graphFile)),
  );
}

export function roleKindsRefusal(
  role: NodeRole,
  entry: RoleEntry,
  debrief: Debrief,
  graphFileExists: (path: string) => boolean,
): string | undefined {
  const present = new Set(roleKindsPresent(debrief, graphFileExists));
  const missing = entry.debrief.requires.filter((kind) => !present.has(kind));
  const forbidden = entry.debrief.forbids.filter((kind) => present.has(kind));
  if (missing.length === 0 && forbidden.length === 0) return undefined;

  const clauses: string[] = [];
  if (missing.length > 0) {
    const unfound =
      missing.includes("graph") && debrief.graphFile !== undefined
        ? `, and its graph_file ${debrief.graphFile} is not in the worktree`
        : "";
    clauses.push(`must return ${listed(missing)} and returns none${unfound}`);
  }
  if (forbidden.length > 0) clauses.push(`must return no ${listed(forbidden)} and returns some`);
  return `${debrief.graph}/${debrief.node} is held: ${article(role)} ${role}'s debrief ${clauses.join("; it ")} (roles@v0).`;
}
