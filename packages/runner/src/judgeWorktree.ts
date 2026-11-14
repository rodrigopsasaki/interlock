import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { currentCommitSha } from "face";
import { heldOn, type Ledger, type LedgerEvent, type Node, type Outcome, outcome } from "ledger";
import type { SubstrateClient } from "substrate";
import type { GateCommand } from "./gateCommand.ts";
import {
  explainGateJudgeRefusal,
  type GateCommandRunner,
  type GateJudgeRefusal,
  judgeGates,
} from "./gateJudge.ts";
import { type MachineAttempt, resolveMachine } from "./machineProvider.ts";
import type { NodeVersionRunner } from "./nodeEngine.ts";
import { gitScope } from "./scope.ts";
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
}

export type JudgeWorktreeRefusal =
  | { readonly kind: "machine"; readonly because: string }
  | { readonly kind: "worktree-status"; readonly refusal: WorktreeRefusal }
  | { readonly kind: "gates"; readonly refusal: GateJudgeRefusal };

export function explainJudgeWorktreeRefusal(refusal: JudgeWorktreeRefusal): string {
  switch (refusal.kind) {
    case "machine":
      return refusal.because;
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
