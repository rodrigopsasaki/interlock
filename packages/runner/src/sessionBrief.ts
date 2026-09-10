import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { err, ok, type Result } from "@phyxiusjs/fp";
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

export interface BriefRefusal {
  readonly kind: "write-failed";
  readonly path: string;
  readonly because: string;
}

export function explainBriefRefusal(refusal: BriefRefusal): string {
  return `${refusal.path}: ${refusal.because}`;
}

// The graph base predates the commit that carries the brief, so the runner writes the brief into the worktree.
export async function writeBriefIntoWorktree(
  repoRoot: string,
  worktreePath: string,
  graph: string,
  node: string,
): Promise<Result<string, BriefRefusal>> {
  const destination = briefPath(worktreePath, graph, node);
  try {
    const content = await readFile(briefPath(repoRoot, graph, node), "utf-8");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf-8");
    return ok(destination);
  } catch (error) {
    return err({
      kind: "write-failed",
      path: destination,
      because: error instanceof Error ? error.message : String(error),
    });
  }
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
