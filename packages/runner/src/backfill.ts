import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { debriefFilePath, readDebriefFile } from "debrief";
import { type GraphDocument, type NodeDeclaration, topologicalOrder } from "face";
import { type Ledger, type Node, type Outcome, sessionRuntime } from "ledger";
import { noneClient } from "substrate";
import { declaredGateIds, gateCommandTable } from "./gateCommand.ts";
import { explainGateJudgeRefusal, type GateJudgeRefusal, judgeGates } from "./gateJudge.ts";
import { type MachineAttempt, resolveMachine } from "./machineProvider.ts";
import { execFileSyncOwned } from "./ownedCommand.ts";
import { gitScope } from "./scope.ts";
import { buildBrief } from "./sessionBrief.ts";
import type { StandingGate } from "./standingGates.ts";
import {
  createDetachedWorktree,
  explainWorktreeRefusal,
  removeWorktree,
  type WorktreeRefusal,
  withAutoMaintenanceDisabled,
} from "./worktree.ts";
import {
  explainWorktreeSetupRefusal,
  runSetupCommand,
  runWorktreeSetup,
  type WorktreeSetupRefusal,
} from "./worktreeSetup.ts";

const HOLD_MS = 24 * 60 * 60 * 1000;

export interface BackfillNodeResult {
  readonly node: string;
  readonly outcome: Outcome;
}

export type BackfillRefusal =
  | { readonly kind: "machine"; readonly because: string }
  | { readonly kind: "worktree"; readonly refusal: WorktreeRefusal }
  | { readonly kind: "worktree-setup"; readonly refusal: WorktreeSetupRefusal }
  | {
      readonly kind: "gate";
      readonly node: string;
      readonly refusal: GateJudgeRefusal;
    };

export function explainBackfillRefusal(refusal: BackfillRefusal): string {
  switch (refusal.kind) {
    case "machine":
      return refusal.because;
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
  readonly machine?: MachineAttempt;
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

  const machine =
    options.machine === undefined ? await resolveMachine(repoRoot) : ok(options.machine);
  if (isErr(machine)) return err({ kind: "machine", because: machine.error });
  const env = withAutoMaintenanceDisabled({ ...process.env, ...machine.value.env });

  const mainSha = execFileSyncOwned("git", ["rev-parse", mainBranch], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
  const worktreePath = join(repoRoot, worktreeRoot, `backfill-${randomUUID()}`);
  const created = createDetachedWorktree(repoRoot, worktreePath, mainSha);
  if (isErr(created)) return err({ kind: "worktree", refusal: created.error });

  const installed = await runSetupCommand(
    "pnpm install --config.confirmModulesPurge=false",
    worktreePath,
    env,
    machine.value.heavy,
  );
  if (isErr(installed)) {
    removeWorktree(repoRoot, worktreePath);
    return err({ kind: "worktree-setup", refusal: installed.error });
  }
  const setUp = await runWorktreeSetup(
    worktreeSetup,
    worktreePath,
    narrate,
    env,
    machine.value.heavy,
  );
  if (isErr(setUp)) {
    removeWorktree(repoRoot, worktreePath);
    return err({ kind: "worktree-setup", refusal: setUp.error });
  }

  const runnerId = `backfill-${randomUUID()}`;
  const scope = gitScope(worktreePath);
  const scopePaths = scope.map((entry) => entry.path);
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
        session: { id: session, node, runtime: sessionRuntime.unknown() },
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
      scopePaths: scope,
      commitSha: mainSha,
      runnerId,
      holdMs: HOLD_MS,
      env,
      heavy: machine.value.heavy,
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
