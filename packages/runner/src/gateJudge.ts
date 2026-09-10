import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Clock } from "@phyxiusjs/clock";
import { elapsedSince } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import {
  buildCleared,
  createReceipt,
  derivation,
  duration,
  explainScopeRefusal,
  gate,
  heldOn,
  nodeKey,
  outcome,
  proposeGateMove,
  spend,
  type Gate,
  type Ledger,
  type Node,
  type Outcome,
  type ScopeRefusal,
} from "ledger";

export const GATE_DERIVATION_VERSION = "runner@0";

export type GateJudgeRefusal = {
  readonly kind: "scope";
  readonly refusal: ScopeRefusal;
};

export function explainGateJudgeRefusal(refusal: GateJudgeRefusal): string {
  return explainScopeRefusal(refusal.refusal);
}

export interface GateJudgeRequest {
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly node: Node;
  readonly declaredGateIds: readonly string[];
  readonly commandFor: ReadonlyMap<string, string>;
  readonly worktree: string;
  readonly scopeRoot: string;
  readonly scopePaths: readonly string[];
  readonly commitSha: string;
  readonly runnerId: string;
  readonly holdMs: number;
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

function spawnGateCommand(
  tokens: readonly string[],
  cwd: string,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  return new Promise((resolve) => {
    const bin = tokens[0];
    if (bin === undefined) {
      resolve({ exitCode: -1, output: "no command configured for this gate" });
      return;
    }
    const child = spawn(bin, tokens.slice(1), { cwd });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf-8");
    });
    child.on("close", (code) => resolve({ exitCode: code ?? -1, output }));
  });
}

function outputHash(output: string): string {
  return createHash("sha256").update(output).digest("hex");
}

// Every gate re-runs, every judgement, regardless of what a prior run or an agent left in the
// journal: cleared is decided only by this run's own execution (brief: "What the runner is").
// The one exception is a receipt whose spend was not none -- inference or money already spent
// is kept, never re-earned for free.
export async function judgeGates(
  request: GateJudgeRequest,
): Promise<Result<Outcome, GateJudgeRefusal>> {
  const {
    ledger,
    clock,
    node,
    declaredGateIds,
    commandFor,
    worktree,
    scopeRoot,
    scopePaths,
    commitSha,
    runnerId,
    holdMs,
  } = request;

  for (const gateId of declaredGateIds) {
    const view = ledger.projection().nodes.get(nodeKey(node));
    const current = view?.gates.get(gateId) ?? gate.pending();
    if (current.kind === "satisfied" && current.receipt.spend.kind !== "none") {
      continue;
    }

    const command = commandFor.get(gateId) ?? "";
    const before = clock.now().monoMs;
    const { exitCode, output } = await spawnGateCommand(
      ["mise", "exec", "--", ...tokenize(command)],
      worktree,
    );
    const after = clock.now().monoMs;

    const built = await createReceipt(
      scopeRoot,
      scopePaths,
      gateId,
      commitSha,
      spend.none(),
      duration.measured(elapsedSince(after, before)),
      derivation.gate(gateId, GATE_DERIVATION_VERSION, runnerId),
      { exitCode, outputHash: outputHash(output) },
    );
    if (isErr(built)) return err({ kind: "scope", refusal: built.error });
    const receipt = built.value;

    const alreadyRecorded = ledger
      .projection()
      .nodes.get(nodeKey(node))
      ?.receipts.find((candidate) => candidate.id === receipt.id);
    if (alreadyRecorded === undefined) {
      ledger.append({ kind: "receipt-written", node, receipt });
    }
    const effectiveReceipt = alreadyRecorded ?? receipt;

    const next =
      exitCode === 0
        ? gate.satisfied(effectiveReceipt)
        : gate.blocked(
            `receipt ${effectiveReceipt.id}, exit code ${exitCode}`,
            `${gateId} exited ${exitCode}`,
          );
    const moved = proposeGateMove(declaredGateIds, gateId, current, next);
    if (isOk(moved)) {
      ledger.append({
        kind: "gate-moved",
        node,
        gate: gateId,
        to: moved.value,
      });
    }
  }

  const finalView = ledger.projection().nodes.get(nodeKey(node));
  const gates: ReadonlyMap<string, Gate> = finalView?.gates ?? new Map();
  const receipts = finalView?.receipts ?? [];
  const cleared = buildCleared(declaredGateIds, gates);
  const resolved: Outcome = isOk(cleared)
    ? cleared.value
    : outcome.held(
        receipts,
        heldOn.gateFailure(cleared.error.missing.join(", "), "hold"),
        `${cleared.error.missing.length} gate(s) not satisfied or waived: ${cleared.error.missing.join(", ")}`,
        clock.now().wallMs + holdMs,
      );

  ledger.append({ kind: "outcome-set", node, outcome: resolved });
  return ok(resolved);
}
