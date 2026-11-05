import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  type BriefRefusal,
  briefFilePath,
  explainBriefRefusal,
  readBriefFile,
  renderSlice,
} from "debrief";
import type { GateDeclaration } from "face";
import type { Brief } from "ledger";
import { narrateContext, type SubstrateClient } from "substrate";
import { narrateAcceptance, reconcileAcceptanceSection } from "./acceptanceSection.ts";
import {
  authoritativeBriefGates,
  diffGates,
  diffRole,
  diffScope,
  renderBriefFile,
} from "./briefRewrite.ts";
import { withRenderedContextSlice } from "./contextSlice.ts";
import { withDebriefAuthoringGuidance } from "./debriefAuthoringGuidance.ts";
import type { SessionRole } from "./openingPrompt.ts";
import { renderOpeningView } from "./openingView.ts";
import type { RoleShape } from "./roleShape.ts";
import { gitTrackedFiles } from "./scope.ts";
import type { StandingGate } from "./standingGates.ts";
import { withWalkSection } from "./walkSection.ts";

export const briefPath = briefFilePath;

export function briefExists(repoRoot: string, graph: string, node: string): boolean {
  return existsSync(briefPath(repoRoot, graph, node));
}

export interface DeclaredNode {
  readonly acceptance: string;
  readonly gates: readonly GateDeclaration[];
}

export interface BriefWriteOutcome {
  readonly path: string;
  readonly narration: readonly string[];
  readonly openingView?: string;
}

export type SessionBriefRefusal =
  | { readonly kind: "read"; readonly refusal: BriefRefusal }
  | { readonly kind: "legacy"; readonly graph: string; readonly node: string }
  | {
      readonly kind: "context-scope-not-tracked";
      readonly path: string;
      readonly selectedPath: string;
    }
  | {
      readonly kind: "write-failed";
      readonly path: string;
      readonly because: string;
    };

export function explainSessionBriefRefusal(refusal: SessionBriefRefusal): string {
  switch (refusal.kind) {
    case "read":
      return explainBriefRefusal(refusal.refusal);
    case "legacy":
      return `brief for ${refusal.graph}/${refusal.node} is brief@v0; the runner requires brief@v1; add front matter`;
    case "context-scope-not-tracked":
      return `${refusal.path}: context_scope path "${refusal.selectedPath}" is not an exact tracked path.`;
    case "write-failed":
      return `${refusal.path}: ${refusal.because}`;
  }
}

export async function writeBriefIntoWorktree(
  repoRoot: string,
  worktreePath: string,
  graph: string,
  node: string,
  graphBaseSha: string,
  session: string,
  standing: readonly StandingGate[],
  declared: DeclaredNode,
  substrate: SubstrateClient,
  shape?: RoleShape,
): Promise<Result<BriefWriteOutcome, SessionBriefRefusal>> {
  const read = await readBriefFile(briefPath(repoRoot, graph, node));
  if (isErr(read)) return err({ kind: "read", refusal: read.error });
  if (read.value.kind === "legacy") return err({ kind: "legacy", graph, node });

  const authoritativeGates = authoritativeBriefGates(standing, declared.gates);
  const authoritativeScope = gitTrackedFiles(repoRoot);
  const contextScope = read.value.frontMatter.contextScope ?? authoritativeScope;
  const tracked = new Set(authoritativeScope);
  const missingSelectedPath = contextScope.find((path) => !tracked.has(path));
  if (missingSelectedPath !== undefined) {
    return err({
      kind: "context-scope-not-tracked",
      path: briefPath(repoRoot, graph, node),
      selectedPath: missingSelectedPath,
    });
  }
  const role = shape?.role ?? read.value.frontMatter.role;
  const acceptance = reconcileAcceptanceSection(read.value.body, declared.acceptance);
  const narration = [
    ...diffRole(read.value.frontMatter.role, role),
    ...diffGates(read.value.frontMatter.gates, authoritativeGates),
    ...diffScope(read.value.frontMatter.scope, authoritativeScope),
    ...narrateAcceptance(node, acceptance),
  ];

  const contextOutcome = await substrate.context({ graph, id: node }, contextScope, role);
  narration.push(narrateContext(substrate.address, contextOutcome));
  const rendered = contextOutcome.kind === "rendered";
  const guidedBody = withDebriefAuthoringGuidance(acceptance.body);
  const authoredBody = shape === undefined ? guidedBody : withWalkSection(guidedBody, shape);
  const body = rendered
    ? withRenderedContextSlice(authoredBody, renderSlice(substrate.address, contextOutcome.items))
    : authoredBody;

  const content = renderBriefFile(
    {
      ...read.value.frontMatter,
      role,
      gates: authoritativeGates,
      scope: authoritativeScope,
      substrate: rendered
        ? { ...read.value.frontMatter.substrate, address: substrate.address }
        : read.value.frontMatter.substrate,
      ...(shape === undefined ? {} : { walk: shape.walk }),
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
  const written = await readBriefFile(destination);
  if (isErr(written)) return err({ kind: "read", refusal: written.error });
  if (written.value.kind === "legacy") return err({ kind: "legacy", graph, node });
  return ok({
    path: destination,
    narration,
    openingView: renderOpeningView(
      written.value.frontMatter,
      written.value.body,
      relative(worktreePath, destination),
    ),
  });
}

export function buildBrief(
  graph: string,
  node: string,
  acceptance: string,
  gates: readonly string[],
  scope: readonly string[],
  role: SessionRole = "worker",
): Brief {
  return { graph, node, role, acceptance, gates, scope };
}
