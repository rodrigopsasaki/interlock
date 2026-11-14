import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { currentCommitSha } from "face";
import {
  heldOn,
  type Ledger,
  type LedgerEvent,
  type Node,
  nodeKey,
  type Outcome,
  outcome,
} from "ledger";
import type { SubstrateClient } from "substrate";
import type { GateCommand } from "./gateCommand.ts";
import {
  explainGateJudgeRefusal,
  type GateCommandRunner,
  type GateJudgeRefusal,
  judgeGates,
} from "./gateJudge.ts";
import type { WatchPath } from "./localConfig.ts";
import { type MachineAttempt, resolveMachine } from "./machineProvider.ts";
import type { NodeVersionRunner } from "./nodeEngine.ts";
import { gitScope } from "./scope.ts";
import {
  changedScopePaths,
  createScopeGuardReceipt,
  describeScopeChange,
  SCOPE_GUARD_RECEIPT_GATE,
  scopeGuardHold,
  snapshotScope,
} from "./scopeGuard.ts";
import { explainWorktreeRefusal, uncommittedPaths, type WorktreeRefusal } from "./worktree.ts";

export const HELD_REVISIT_MS = 24 * 60 * 60 * 1000;

export interface JudgeWorktreeRequest {
  readonly machine?: MachineAttempt;
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly node: Node;
  readonly session: string;
  readonly declaredGateIds: readonly string[];
  readonly commandFor: ReadonlyMap<string, GateCommand>;
  readonly worktree: string;
  readonly authoritativeGraphPath?: string;
  readonly parsedGraphHash?: string;
  readonly narrate: (line: string) => void;
  readonly runnerId: string;
  readonly holdMs: number;
  readonly holdTimeoutMs?: number;
  readonly substrate: SubstrateClient;
  readonly personEvents?: readonly LedgerEvent[];
  readonly nodeVersionRunner?: NodeVersionRunner;
  readonly commandRunner?: GateCommandRunner;
  readonly outputDirectory?: string;
  readonly onWorktreeRead?: () => Promise<void>;
  readonly scopeGuardRecheck?: boolean;
  readonly watchPaths?: readonly WatchPath[];
}

export type JudgeWorktreeRefusal =
  | { readonly kind: "machine"; readonly because: string }
  | { readonly kind: "worktree-status"; readonly refusal: WorktreeRefusal }
  | { readonly kind: "scope-guard"; readonly because: string }
  | { readonly kind: "gates"; readonly refusal: GateJudgeRefusal };

export function explainJudgeWorktreeRefusal(refusal: JudgeWorktreeRefusal): string {
  switch (refusal.kind) {
    case "machine":
      return refusal.because;
    case "worktree-status":
      return explainWorktreeRefusal(refusal.refusal);
    case "scope-guard":
      return refusal.because;
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
    authoritativeGraphPath,
    parsedGraphHash,
    narrate,
    runnerId,
    holdMs,
    holdTimeoutMs,
    substrate,
    personEvents = [],
    nodeVersionRunner,
    commandRunner,
    outputDirectory,
    onWorktreeRead,
    scopeGuardRecheck = false,
    watchPaths = [],
  } = request;

  const machine =
    request.machine === undefined ? await resolveMachine(worktree) : ok(request.machine);
  if (isErr(machine)) return err({ kind: "machine", because: machine.error });

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

  const view = ledger.projection().nodes.get(nodeKey(node));
  const heldScope = scopeGuardHold(view?.outcome);
  if (heldScope !== undefined) {
    const commitSha = await currentCommitSha(worktree);
    const authorized = view?.receipts.some((receipt) => {
      if (receipt.gate !== SCOPE_GUARD_RECEIPT_GATE) return false;
      const action = receipt.proof["action"];
      const recordedSession = receipt.proof["session"];
      if (recordedSession !== session || typeof action !== "string") return false;
      if (action === "person-clear") return receipt.derivation.kind === "human";
      return (
        action === "recheck" &&
        receipt.derivation.kind === "gate" &&
        receipt.commitSha === commitSha
      );
    });
    if (!authorized && !scopeGuardRecheck) {
      const paths = heldScope.paths.join(", ") || "(no paths recorded)";
      return err({
        kind: "scope-guard",
        because:
          `scope guard hold refuses judge clearance for session ${session}: ${heldScope.because}; ` +
          `paths: ${paths}; rerun the guard comparison or use a person's named scope-guard clear.`,
      });
    }
    if (!authorized) {
      const before = snapshotScope(worktree, watchPaths);
      if (isErr(before)) {
        return err({
          kind: "scope-guard",
          because: `scope guard recheck failed for ${before.error.path}: ${before.error.because}`,
        });
      }
      const after = snapshotScope(worktree, watchPaths);
      if (isErr(after)) {
        return err({
          kind: "scope-guard",
          because: `scope guard recheck failed for ${after.error.path}: ${after.error.because}`,
        });
      }
      const changes = changedScopePaths(before.value, after.value);
      if (changes.length > 0) {
        return err({
          kind: "scope-guard",
          because: `scope guard recheck found changed paths: ${changes.map(describeScopeChange).join(", ")}`,
        });
      }
      const receipt = await createScopeGuardReceipt({
        worktree,
        session,
        commitSha,
        action: "recheck",
        paths: heldScope.paths,
        actor: runnerId,
        checkedAt: clock.now().wallMs,
        changedPaths: [],
      });
      if (isErr(receipt)) return err({ kind: "scope-guard", because: receipt.error });
      ledger.append({ kind: "receipt-written", node, receipt: receipt.value });
      narrate(
        `scope guard recheck recorded for session ${session}; no changed paths outside the worktree.`,
      );
    }
  }

  const commitSha = await currentCommitSha(worktree);
  const judged = await judgeGates({
    ledger,
    clock,
    node,
    session,
    declaredGateIds,
    commandFor,
    worktree,
    scopeRoot: worktree,
    scopePaths: gitScope(worktree),
    ...(authoritativeGraphPath === undefined ? {} : { authoritativeGraphPath }),
    ...(parsedGraphHash === undefined ? {} : { parsedGraphHash }),
    commitSha,
    runnerId,
    holdMs,
    ...(holdTimeoutMs === undefined ? {} : { holdTimeoutMs }),
    substrate,
    personEvents,
    ...(nodeVersionRunner === undefined ? {} : { nodeVersionRunner }),
    ...(commandRunner === undefined ? {} : { commandRunner }),
    ...(outputDirectory === undefined ? {} : { outputDirectory }),
    env: { ...process.env, ...machine.value.env },
    heavy: machine.value.heavy,
    narrate,
  });
  return isErr(judged) ? err({ kind: "gates", refusal: judged.error }) : ok(judged.value);
}
