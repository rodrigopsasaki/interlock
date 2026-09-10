import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Brief } from "ledger";

export function briefPath(
  repoRoot: string,
  graph: string,
  node: string,
): string {
  return join(repoRoot, ".interlock", "sessions", graph, node, "brief.md");
}

export function briefExists(
  repoRoot: string,
  graph: string,
  node: string,
): boolean {
  return existsSync(briefPath(repoRoot, graph, node));
}

export function buildBrief(
  graph: string,
  node: string,
  acceptance: string,
  gates: readonly string[],
  scope: readonly string[],
): Brief {
  return { graph, node, role: "worker", acceptance, gates, scope };
}
