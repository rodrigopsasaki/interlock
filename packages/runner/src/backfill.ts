import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { type GraphDocument, type NodeDeclaration, topologicalOrder } from "face";
import type { Ledger, Node, Outcome } from "ledger";
import { noneClient } from "substrate";
import { declaredGateIds, gateCommandTable } from "./gateCommand.ts";
import { explainGateJudgeRefusal, type GateJudgeRefusal, judgeGates } from "./gateJudge.ts";
import { gitTrackedFiles } from "./scope.ts";
import { buildBrief } from "./sessionBrief.ts";
import type { StandingGate } from "./standingGates.ts";
import {
  createDetachedWorktree,
  explainWorktreeRefusal,
  removeWorktree,
  type WorktreeRefusal,
} from "./worktree.ts";
import {
  explainWorktreeSetupRefusal,
  runWorktreeSetup,
  type WorktreeSetupRefusal,
} from "./worktreeSetup.ts";

const HOLD_MS = 24 * 60 * 60 * 1000;

export interface BackfillNodeResult {
  readonly node: string;
  readonly outcome: Outcome;
}

export type BackfillRefusal =
  | { readonly kind: "worktree"; readonly refusal: WorktreeRefusal }
  | { readonly kind: "worktree-setup"; readonly refusal: WorktreeSetupRefusal }
  | {
      readonly kind: "gate";
      readonly node: string;
      readonly refusal: GateJudgeRefusal;
    };

export function explainBackfillRefusal(refusal: BackfillRefusal): string {
  switch (refusal.kind) {
    case "worktree":
      return explainWorktreeRefusal(refusal.refusal);
    case "worktree-setup":
      return explainWorktreeSetupRefusal(refusal.refusal);
    case "gate":
      return `${refusal.node}: ${explainGateJudgeRefusal(refusal.refusal)}`;
  }
}

function hasDebrief(repoRoot: string, graph: string, nodeId: string): boolean {
  return existsSync(join(repoRoot, ".interlock", "sessions", graph, nodeId, "debrief.yaml"));
}

export function backfillSessionId(graph: string, nodeId: string): string {
  return `backfill-${graph}-${nodeId}`;
}

export interface BackfillOptions {
  readonly repoRoot: string;
  readonly mainBranch: string;
  readonly document: GraphDocument;
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly standingGates: readonly StandingGate[];
  readonly worktreeRoot: string;
  readonly worktreeSetup?: readonly string[];
  readonly narrate?: (line: string) => void;
}

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
    worktreeSetup = [],
    narrate = () => {},
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

  const setUp = await runWorktreeSetup(worktreeSetup, worktreePath, narrate);
  if (isErr(setUp)) {
    removeWorktree(repoRoot, worktreePath);
    return err({ kind: "worktree-setup", refusal: setUp.error });
  }

  const runnerId = `backfill-${randomUUID()}`;
  const scopePaths = gitTrackedFiles(worktreePath);
  const ordered = topologicalOrder(document.nodes);
  const candidates: readonly NodeDeclaration[] = isOk(ordered) ? ordered.value : document.nodes;

  const results: BackfillNodeResult[] = [];
  for (const declaration of candidates) {
    if (!hasDebrief(repoRoot, document.id, declaration.id)) continue;
    const undebriefedDependency = declaration.dependsOn.find(
      (dependsOn) => !hasDebrief(repoRoot, document.id, dependsOn),
    );
    if (undebriefedDependency !== undefined) continue;

    const node: Node = { graph: document.id, id: declaration.id };
    const session = backfillSessionId(document.id, declaration.id);
    const declaredIds = declaredGateIds(standingGates, declaration.gates);

    if (!ledger.projection().sessions.has(session)) {
      ledger.append({
        kind: "session-started",
        session: { id: session, node },
        brief: buildBrief(
          document.id,
          declaration.id,
          declaration.acceptance ?? "",
          declaredIds,
          scopePaths,
        ),
        graphBaseSha: mainSha,
      });

      const debriefRead = await readDebriefFile(
        debriefFilePath(worktreePath, document.id, declaration.id),
      );
      if (isOk(debriefRead) && debriefRead.value.kind === "legacy") {
        ledger.append({
          kind: "session-narrated",
          session,
          at: clock.now().wallMs,
          line: `debrief.yaml reads as ${debriefRead.value.version}, legacy; not ingested`,
        });
      }
    }

    const judged = await judgeGates({
      ledger,
      clock,
      node,
      session,
      declaredGateIds: declaredIds,
      commandFor: gateCommandTable(standingGates, declaration.gates),
      worktree: worktreePath,
      scopeRoot: worktreePath,
      scopePaths,
      commitSha: mainSha,
      runnerId,
      holdMs: HOLD_MS,
      substrate: noneClient(),
      narrate: () => {},
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
