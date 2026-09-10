import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import {
  topologicalOrder,
  type GraphDocument,
  type NodeDeclaration,
} from "face";
import type { Ledger, Node, Outcome } from "ledger";
import { declaredGateIds, gateCommandTable } from "./gateCommand.ts";
import {
  explainGateJudgeRefusal,
  judgeGates,
  type GateJudgeRefusal,
} from "./gateJudge.ts";
import { gitTrackedFiles } from "./scope.ts";
import type { StandingGate } from "./standingGates.ts";
import {
  createDetachedWorktree,
  explainWorktreeRefusal,
  removeWorktree,
  type WorktreeRefusal,
} from "./worktree.ts";

const HOLD_MS = 24 * 60 * 60 * 1000;

export interface BackfillNodeResult {
  readonly node: string;
  readonly outcome: Outcome;
}

export type BackfillRefusal =
  | { readonly kind: "worktree"; readonly refusal: WorktreeRefusal }
  | {
      readonly kind: "gate";
      readonly node: string;
      readonly refusal: GateJudgeRefusal;
    };

export function explainBackfillRefusal(refusal: BackfillRefusal): string {
  switch (refusal.kind) {
    case "worktree":
      return explainWorktreeRefusal(refusal.refusal);
    case "gate":
      return `${refusal.node}: ${explainGateJudgeRefusal(refusal.refusal)}`;
  }
}

function hasDebrief(repoRoot: string, graph: string, nodeId: string): boolean {
  return existsSync(
    join(repoRoot, ".interlock", "sessions", graph, nodeId, "debrief.yaml"),
  );
}

export interface BackfillOptions {
  readonly repoRoot: string;
  readonly mainBranch: string;
  readonly document: GraphDocument;
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly standingGates: readonly StandingGate[];
  readonly worktreeRoot: string;
}

// Eligibility is by a dependency having a debrief, because a standing gate that always fails would otherwise starve every dependent.
export async function backfillGraph(
  options: BackfillOptions,
): Promise<Result<readonly BackfillNodeResult[], BackfillRefusal>> {
  const {
    repoRoot,
    mainBranch,
    document,
    ledger,
    clock,
    standingGates,
    worktreeRoot,
  } = options;

  const mainSha = execFileSync("git", ["rev-parse", mainBranch], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
  const worktreePath = join(repoRoot, worktreeRoot, `backfill-${randomUUID()}`);
  const created = createDetachedWorktree(repoRoot, worktreePath, mainSha);
  if (isErr(created)) return err({ kind: "worktree", refusal: created.error });

  execFileSync("mise", ["exec", "--", "pnpm", "install"], {
    cwd: worktreePath,
    stdio: "ignore",
  });

  const runnerId = `backfill-${randomUUID()}`;
  const scopePaths = gitTrackedFiles(worktreePath);
  const ordered = topologicalOrder(document.nodes);
  const candidates: readonly NodeDeclaration[] = isOk(ordered)
    ? ordered.value
    : document.nodes;

  const results: BackfillNodeResult[] = [];
  for (const declaration of candidates) {
    if (!hasDebrief(repoRoot, document.id, declaration.id)) continue;
    const undebriefedDependency = declaration.dependsOn.find(
      (dependsOn) => !hasDebrief(repoRoot, document.id, dependsOn),
    );
    if (undebriefedDependency !== undefined) continue;

    const node: Node = { graph: document.id, id: declaration.id };
    const judged = await judgeGates({
      ledger,
      clock,
      node,
      declaredGateIds: declaredGateIds(standingGates, declaration.gates),
      commandFor: gateCommandTable(standingGates, declaration.gates),
      worktree: worktreePath,
      scopeRoot: worktreePath,
      scopePaths,
      commitSha: mainSha,
      runnerId,
      holdMs: HOLD_MS,
    });
    if (isErr(judged)) {
      removeWorktree(repoRoot, worktreePath);
      return err({ kind: "gate", node: declaration.id, refusal: judged.error });
    }
    results.push({ node: declaration.id, outcome: judged.value });
  }

  removeWorktree(repoRoot, worktreePath);
  return ok(results);
}
