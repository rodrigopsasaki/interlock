import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Clock } from "@phyxiusjs/clock";
import { elapsedSince } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import {
  briefFilePath,
  debriefFilePath,
  notesFilePath,
  readBriefFile,
  readDebriefFile,
  readNotesFile,
} from "debrief";
import {
  buildCleared,
  createReceipt,
  type Debrief,
  derivation,
  duration,
  explainScopeRefusal,
  type Gap,
  type Gate,
  gate,
  heldOn,
  type Ledger,
  type LedgerEvent,
  type Node,
  type Note,
  nodeKey,
  type Outcome,
  outcome,
  proposeGateMove,
  type Receipt,
  type ScopeRefusal,
  spend,
} from "ledger";
import {
  type EvidenceForAbsorb,
  type EvidenceSession,
  evidenceOf,
  narrateAbsorb,
  personEventsFor,
  type SubstrateClient,
} from "substrate";
import { verifyDebrief } from "verifier";
import { contextSliceOf } from "./contextSlice.ts";
import { type GateCommand, type PlaceholderRefusal, substituteGateCommand } from "./gateCommand.ts";
import { HARNESS_AUTHORITIES } from "./sweep.ts";

export const GATE_DERIVATION_VERSION = "runner@0";

export type GateJudgeRefusal =
  | { readonly kind: "scope"; readonly refusal: ScopeRefusal }
  | {
      readonly kind: "placeholder";
      readonly gateId: string;
      readonly refusal: PlaceholderRefusal;
    };

export function explainGateJudgeRefusal(refusal: GateJudgeRefusal): string {
  switch (refusal.kind) {
    case "scope":
      return explainScopeRefusal(refusal.refusal);
    case "placeholder":
      return `${refusal.gateId}: "${refusal.refusal.command}" names unknown placeholder "{${refusal.refusal.token}}".`;
  }
}

export interface GateJudgeRequest {
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly node: Node;
  readonly session: string;
  readonly declaredGateIds: readonly string[];
  readonly commandFor: ReadonlyMap<string, GateCommand>;
  readonly worktree: string;
  readonly scopeRoot: string;
  readonly scopePaths: readonly string[];
  readonly commitSha: string;
  readonly runnerId: string;
  readonly holdMs: number;
  readonly substrate: SubstrateClient;
  readonly personEvents?: readonly LedgerEvent[];
  readonly narrate: (line: string) => void;
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

function unmetCriterion(exitCode: number, pattern: RegExp | undefined): string {
  return exitCode !== 0 ? `exit ${exitCode}` : `output did not match /${pattern?.source ?? ""}/`;
}

function heldBecause(
  missing: readonly string[],
  commandFor: ReadonlyMap<string, GateCommand>,
): string {
  const awaitingPerson = missing.filter((gateId) => commandFor.get(gateId)?.kind === "human");
  if (awaitingPerson.length === 0) {
    return `${missing.length} gate(s) not satisfied or waived: ${missing.join(", ")}`;
  }
  const clears = awaitingPerson.length === 1 ? "it" : "them";
  return awaitingPerson.length === missing.length
    ? `${missing.join(", ")}: awaits a person; a person's verb clears ${clears}.`
    : `${missing.length} gate(s) not satisfied or waived: ${missing.join(", ")}; ${awaitingPerson.join(", ")} awaits a person, cleared only by a person's verb.`;
}

export async function judgeGates(
  request: GateJudgeRequest,
): Promise<Result<Outcome, GateJudgeRefusal>> {
  const {
    ledger,
    clock,
    node,
    session,
    declaredGateIds,
    commandFor,
    worktree,
    scopeRoot,
    scopePaths,
    commitSha,
    runnerId,
    holdMs,
    substrate,
    personEvents = [],
    narrate,
  } = request;

  const gateMovedThisRun: LedgerEvent[] = [];

  for (const gateId of declaredGateIds) {
    const view = ledger.projection().nodes.get(nodeKey(node));
    const current = view?.gates.get(gateId) ?? gate.pending();
    const gateCommand = commandFor.get(gateId);

    if (gateCommand?.kind === "human") {
      if (current.kind !== "satisfied" && current.kind !== "waived") {
        narrate(`${gateId}: awaits a person`);
      }
      continue;
    }

    if (current.kind === "satisfied" && current.receipt.spend.kind !== "none") {
      continue;
    }

    const substituted = substituteGateCommand(gateCommand?.run ?? "", node);
    if (isErr(substituted)) return err({ kind: "placeholder", gateId, refusal: substituted.error });

    const before = clock.now().monoMs;
    const { exitCode, output } = await spawnGateCommand(
      ["mise", "exec", "--", ...tokenize(substituted.value)],
      worktree,
    );
    const after = clock.now().monoMs;

    const pattern = gateCommand?.expectOutput;
    const satisfied = exitCode === 0 && (pattern === undefined || pattern.test(output));
    const proof =
      pattern === undefined
        ? { exitCode, outputHash: outputHash(output) }
        : {
            exitCode,
            outputHash: outputHash(output),
            outputMatched: pattern.test(output),
            pattern: pattern.source,
          };

    const built = await createReceipt(
      scopeRoot,
      scopePaths,
      gateId,
      commitSha,
      spend.none(),
      duration.measured(elapsedSince(after, before)),
      derivation.gate(gateId, GATE_DERIVATION_VERSION, runnerId),
      proof,
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

    const next = satisfied
      ? gate.satisfied(effectiveReceipt)
      : gate.blocked(
          `receipt ${effectiveReceipt.id}, ${unmetCriterion(exitCode, pattern)}`,
          `${gateId}: ${unmetCriterion(exitCode, pattern)}`,
        );
    const moved = proposeGateMove(declaredGateIds, gateId, current, next);
    if (isOk(moved)) {
      const movedEvent: LedgerEvent = {
        kind: "gate-moved",
        node,
        gate: gateId,
        to: moved.value,
      };
      ledger.append(movedEvent);
      gateMovedThisRun.push(movedEvent);
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
        heldBecause(cleared.error.missing, commandFor),
        clock.now().wallMs + holdMs,
      );

  if (resolved.kind === "cleared") {
    await ingestDebrief(ledger, session, worktree, node);
  }

  await absorbDebrief(substrate, narrate, worktree, node, receipts, [
    ...personEvents,
    ...gateMovedThisRun,
  ]);

  ledger.append({ kind: "outcome-set", node, outcome: resolved });
  return ok(resolved);
}

async function readV2Debrief(
  worktree: string,
  node: Node,
): Promise<{ readonly debrief: Debrief; readonly notes: readonly Note[] } | undefined> {
  const debriefRead = await readDebriefFile(debriefFilePath(worktree, node.graph, node.id));
  if (isErr(debriefRead) || debriefRead.value.kind !== "v2") return undefined;

  const notesRead = await readNotesFile(notesFilePath(worktree, node.graph, node.id));
  return {
    debrief: debriefRead.value.debrief,
    notes: isErr(notesRead) ? [] : notesRead.value,
  };
}

async function ingestDebrief(
  ledger: Ledger,
  session: string,
  worktree: string,
  node: Node,
): Promise<void> {
  const alreadyIngested = ledger.projection().sessions.get(session)?.debrief !== undefined;
  if (alreadyIngested) return;

  const read = await readV2Debrief(worktree, node);
  if (read === undefined) return;

  ledger.append({ kind: "debrief-filed", session, debrief: read.debrief });
  for (const note of read.notes) {
    ledger.append({ kind: "note-appended", session, note });
  }
}

async function evidenceForAbsorb(
  worktree: string,
  debrief: Debrief,
  receipts: readonly Receipt[],
  node: Node,
  personEvents: readonly LedgerEvent[],
): Promise<EvidenceForAbsorb | undefined> {
  const verified = await verifyDebrief(worktree, debrief);
  const decisions: EvidenceSession["decisions"] = isErr(verified)
    ? debrief.decisions.map((decision) => ({ decision, marks: [] }))
    : verified.value.decisionMarks;
  const discoveries: EvidenceSession["discoveries"] = isErr(verified)
    ? []
    : verified.value.discoveryMarks;
  const vocabularyGaps: readonly Gap[] = isErr(verified)
    ? []
    : verified.value.marks.filter((mark) => mark.kind === "gap").map((mark) => mark.gap);

  const evidence = evidenceOf({
    derivation: debrief.derivation,
    decisions,
    discoveries,
    receipts,
    personEvents: personEventsFor(node, personEvents),
    harnessAuthorities: HARNESS_AUTHORITIES,
  });

  const gaps = [...vocabularyGaps, ...evidence.gaps];
  return evidence.items.length === 0 && gaps.length === 0
    ? undefined
    : { items: evidence.items, gaps };
}

async function absorbDebrief(
  substrate: SubstrateClient,
  narrate: (line: string) => void,
  worktree: string,
  node: Node,
  receipts: readonly Receipt[],
  personEvents: readonly LedgerEvent[],
): Promise<void> {
  const read = await readV2Debrief(worktree, node);
  if (read === undefined) return;

  const evidence = await evidenceForAbsorb(worktree, read.debrief, receipts, node, personEvents);
  const acknowledged = await substrate.absorb(node, read.debrief, read.notes, receipts, evidence);
  const briefRead = await readBriefFile(briefFilePath(worktree, node.graph, node.id));
  const sliceBody =
    !isErr(briefRead) && briefRead.value.kind === "v1" ? contextSliceOf(briefRead.value.body) : "";
  narrate(
    narrateAbsorb(substrate.address, acknowledged, {
      body: sliceBody,
      discoveries: read.debrief.discoveries,
    }),
  );
}
