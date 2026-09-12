import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { currentCommitSha } from "face";
import {
  heldOn,
  type Ledger,
  type LedgerEvent,
  type Node,
  type Outcome,
  outcome,
} from "ledger";
import type { SubstrateClient } from "substrate";
import type { GateCommand } from "./gateCommand.ts";
import {
  explainGateJudgeRefusal,
  type GateJudgeRefusal,
  judgeGates,
} from "./gateJudge.ts";
import { gitTrackedFiles } from "./scope.ts";
import {
  explainWorktreeRefusal,
  uncommittedPaths,
  type WorktreeRefusal,
} from "./worktree.ts";

export const HELD_REVISIT_MS = 24 * 60 * 60 * 1000;

export interface JudgeWorktreeRequest {
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly node: Node;
  readonly session: string;
  readonly declaredGateIds: readonly string[];
  readonly commandFor: ReadonlyMap<string, GateCommand>;
  readonly worktree: string;
  readonly narrate: (line: string) => void;
  readonly runnerId: string;
  readonly holdMs: number;
  readonly substrate: SubstrateClient;
  readonly personEvents?: readonly LedgerEvent[];
  readonly onWorktreeRead?: () => Promise<void>;
}

export type JudgeWorktreeRefusal =
  | { readonly kind: "worktree-status"; readonly refusal: WorktreeRefusal }
  | { readonly kind: "gates"; readonly refusal: GateJudgeRefusal };

export function explainJudgeWorktreeRefusal(
  refusal: JudgeWorktreeRefusal,
): string {
  switch (refusal.kind) {
    case "worktree-status":
      return explainWorktreeRefusal(refusal.refusal);
    case "gates":
      return explainGateJudgeRefusal(refusal.refusal);
  }
}

export async function judgeWorktree(
  request: JudgeWorktreeRequest,
): Promise<Result<Outcome, JudgeWorktreeRefusal>> {
  const {
    ledger,
    clock,
    node,
    session,
    declaredGateIds,
    commandFor,
    worktree,
    narrate,
    runnerId,
    holdMs,
    substrate,
    personEvents = [],
    onWorktreeRead,
  } = request;

  const dirty = uncommittedPaths(worktree);
  if (isErr(dirty)) {
    return err({ kind: "worktree-status", refusal: dirty.error });
  }

  if (onWorktreeRead !== undefined) await onWorktreeRead();

  if (dirty.value.length > 0) {
    const because = `${dirty.value.length} uncommitted path(s) in the worktree; gates judge commits only`;
    narrate(because);
    for (const path of dirty.value.slice(0, 5)) narrate(`  ${path}`);
    const held = outcome.held(
      [],
      heldOn.uncommittedWork(dirty.value.length),
      because,
      clock.now().wallMs + holdMs,
    );
    ledger.append({ kind: "outcome-set", node, outcome: held });
    return ok(held);
  }

  const commitSha = currentCommitSha(worktree);
  const judged = await judgeGates({
    ledger,
    clock,
    node,
    session,
    declaredGateIds,
    commandFor,
    worktree,
    scopeRoot: worktree,
    scopePaths: gitTrackedFiles(worktree),
    commitSha,
    runnerId,
    holdMs,
    substrate,
    personEvents,
    narrate,
  });
  return isErr(judged)
    ? err({ kind: "gates", refusal: judged.error })
    : ok(judged.value);
}
