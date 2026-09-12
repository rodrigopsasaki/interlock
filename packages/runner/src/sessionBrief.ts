import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  briefFilePath,
  explainBriefRefusal,
  readBriefFile,
  renderSlice,
  type BriefRefusal,
} from "debrief";
import type { GateDeclaration } from "face";
import type { Brief } from "ledger";
import { narrateContext, type SubstrateClient } from "substrate";
import {
  authoritativeBriefGates,
  diffGates,
  diffScope,
  renderBriefFile,
} from "./briefRewrite.ts";
import { withRenderedContextSlice } from "./contextSlice.ts";
import { gitTrackedFiles } from "./scope.ts";
import type { StandingGate } from "./standingGates.ts";

export const briefPath = briefFilePath;

export function briefExists(
  repoRoot: string,
  graph: string,
  node: string,
): boolean {
  return existsSync(briefPath(repoRoot, graph, node));
}

export interface BriefWriteOutcome {
  readonly path: string;
  readonly narration: readonly string[];
}

export type SessionBriefRefusal =
  | { readonly kind: "read"; readonly refusal: BriefRefusal }
  | { readonly kind: "legacy"; readonly graph: string; readonly node: string }
  | {
      readonly kind: "write-failed";
      readonly path: string;
      readonly because: string;
    };

export function explainSessionBriefRefusal(
  refusal: SessionBriefRefusal,
): string {
  switch (refusal.kind) {
    case "read":
      return explainBriefRefusal(refusal.refusal);
    case "legacy":
      return `brief for ${refusal.graph}/${refusal.node} is brief@v0; the runner requires brief@v1; add front matter`;
    case "write-failed":
      return `${refusal.path}: ${refusal.because}`;
  }
}

// Reads the repository's brief, fills the two runner-only front-matter fields, and rewrites
// gates and scope from the graph and standing table: the runner's view is authoritative, and a
// difference from the repository copy is narrated, never silently overwritten without a line.
export async function writeBriefIntoWorktree(
  repoRoot: string,
  worktreePath: string,
  graph: string,
  node: string,
  graphBaseSha: string,
  session: string,
  standing: readonly StandingGate[],
  nodeGates: readonly GateDeclaration[],
  substrate: SubstrateClient,
): Promise<Result<BriefWriteOutcome, SessionBriefRefusal>> {
  const read = await readBriefFile(briefPath(repoRoot, graph, node));
  if (isErr(read)) return err({ kind: "read", refusal: read.error });
  if (read.value.kind === "legacy") return err({ kind: "legacy", graph, node });

  const authoritativeGates = authoritativeBriefGates(standing, nodeGates);
  const authoritativeScope = gitTrackedFiles(repoRoot);
  const narration = [
    ...diffGates(read.value.frontMatter.gates, authoritativeGates),
    ...diffScope(read.value.frontMatter.scope, authoritativeScope),
  ];

  const contextOutcome = await substrate.context(
    { graph, id: node },
    authoritativeScope,
    read.value.frontMatter.role,
  );
  narration.push(narrateContext(substrate.address, contextOutcome));
  const body =
    contextOutcome.kind === "rendered"
      ? withRenderedContextSlice(
          read.value.body,
          renderSlice(substrate.address, contextOutcome.items),
        )
      : read.value.body;

  const content = renderBriefFile(
    {
      ...read.value.frontMatter,
      gates: authoritativeGates,
      scope: authoritativeScope,
      runner: { kind: "worktree", graphBaseSha, session },
    },
    body,
  );

  const destination = briefPath(worktreePath, graph, node);
  try {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf-8");
  } catch (error) {
    return err({
      kind: "write-failed",
      path: destination,
      because: error instanceof Error ? error.message : String(error),
    });
  }
  return ok({ path: destination, narration });
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
