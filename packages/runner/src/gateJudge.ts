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
  OUTBOX_INTENT_SHAPE,
  type OutboxArtifact,
  type OutboxDelivery,
  type OutboxIntent,
  type Outcome,
  outcome,
  proposeGateMove,
  type Receipt,
  retainOutboxArtifact,
  type ScopeRefusal,
  spend,
} from "ledger";
import {
  type AbsorbOutcome,
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
import {
  explainGateOutputRefusal,
  type GateOutputRefusal,
  retainGateOutput,
} from "./gateOutput.ts";
import { HARNESS_AUTHORITIES } from "./sweep.ts";

export const GATE_DERIVATION_VERSION = "runner@0";

export type GateJudgeRefusal =
  | { readonly kind: "scope"; readonly refusal: ScopeRefusal }
  | { readonly kind: "output"; readonly refusal: GateOutputRefusal }
  | {
      readonly kind: "placeholder";
      readonly gateId: string;
      readonly refusal: PlaceholderRefusal;
    };

export function explainGateJudgeRefusal(refusal: GateJudgeRefusal): string {
  switch (refusal.kind) {
    case "scope":
      return explainScopeRefusal(refusal.refusal);
    case "output":
      return explainGateOutputRefusal(refusal.refusal);
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

export function legacyOutputForChunk(chunk: Buffer): string {
  return chunk.toString("utf-8");
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

function spawnGateCommand(
  tokens: readonly string[],
  cwd: string,
): Promise<{
  readonly exitCode: number;
  readonly output: string;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
}> {
  return new Promise((resolve) => {
    const bin = tokens[0];
    if (bin === undefined) {
      const output = "no command configured for this gate";
      resolve({ exitCode: -1, output, stdout: Buffer.alloc(0), stderr: Buffer.from(output) });
      return;
    }
    const child = spawn(bin, tokens.slice(1), { cwd });
    let output = "";
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      output += legacyOutputForChunk(chunk);
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += legacyOutputForChunk(chunk);
      stderr.push(chunk);
    });
    child.on("close", (code) =>
      resolve({
        exitCode: code ?? -1,
        output,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      }),
    );
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
    const { exitCode, output, stdout, stderr } = await spawnGateCommand(
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

    const retained = await retainGateOutput(worktree, stdout, stderr);
    if (isErr(retained)) return err({ kind: "output", refusal: retained.error });
    const proofWithOutput = { ...proof, gateOutput: retained.value };

    const built = await createReceipt(
      scopeRoot,
      scopePaths,
      gateId,
      commitSha,
      spend.none(),
      duration.measured(elapsedSince(after, before)),
      derivation.gate(gateId, GATE_DERIVATION_VERSION, runnerId),
      proofWithOutput,
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

  await absorbDebrief(ledger, substrate, narrate, worktree, node, session, runnerId, receipts, [
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
  ledger: Ledger,
  substrate: SubstrateClient,
  narrate: (line: string) => void,
  worktree: string,
  node: Node,
  session: string,
  runnerId: string,
  receipts: readonly Receipt[],
  personEvents: readonly LedgerEvent[],
): Promise<void> {
  const read = await readV2Debrief(worktree, node);
  if (read === undefined) return;

  const evidence = await evidenceForAbsorb(worktree, read.debrief, receipts, node, personEvents);
  const acknowledged = await absorbThroughOutbox(
    ledger,
    substrate,
    node,
    session,
    runnerId,
    read.debrief,
    read.notes,
    receipts,
    evidence,
  );
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

function effectId(
  target: string,
  repository:
    | { readonly owner: string; readonly name: string; readonly originUrl: string }
    | undefined,
  node: Node,
  session: string,
  debrief: Debrief,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ target, repository, node, session, debrief }))
    .digest("hex");
}

function refusal(because: string): { readonly kind: "refused"; readonly because: string } {
  return { kind: "refused", because };
}

function outboxDerivation(runnerId: string) {
  return derivation.gate("outbox", GATE_DERIVATION_VERSION, runnerId);
}

function recordUncertainDelivery(
  ledger: Ledger,
  id: string,
  because: string,
  runnerId: string,
): boolean {
  const delivery: OutboxDelivery = {
    id,
    state: "uncertain",
    because,
    derivation: outboxDerivation(runnerId),
  };
  return !isErr(ledger.appendConfirmed({ kind: "outbox-delivery-recorded", delivery }));
}

function recordAcknowledgedDelivery(
  ledger: Ledger,
  id: string,
  because: string,
  runnerId: string,
  acknowledgment: OutboxArtifact,
): boolean {
  const delivery: OutboxDelivery = {
    id,
    state: "acknowledged",
    because,
    derivation: outboxDerivation(runnerId),
    acknowledgment,
  };
  return !isErr(ledger.appendConfirmed({ kind: "outbox-delivery-recorded", delivery }));
}

async function absorbThroughOutbox(
  ledger: Ledger,
  substrate: SubstrateClient,
  node: Node,
  session: string,
  runnerId: string,
  debrief: Debrief,
  notes: readonly Note[],
  receipts: readonly Receipt[],
  evidence: EvidenceForAbsorb | undefined,
): Promise<AbsorbOutcome> {
  if (substrate.prepareAbsorb === undefined)
    return refusal("absorb adapter cannot prepare a request");
  const prepared = await substrate.prepareAbsorb(node, debrief, notes, receipts, evidence);
  if (prepared.kind === "none") return { kind: "empty" };
  if (prepared.kind === "refused") return prepared;
  if (substrate.dispatchAbsorb === undefined)
    return refusal("absorb adapter cannot dispatch a prepared request");

  const id = effectId(prepared.target, prepared.repository, node, session, debrief);
  const existing = ledger.projection().outbox.get(id);
  if (existing !== undefined) {
    const existingEvidence = ledger.readOutboxEvidence(node, session, id);
    if (existingEvidence.kind !== "verified") {
      return refusal("outbox delivery evidence is unavailable or corrupt");
    }
    if (!existingEvidence.request.equals(Buffer.from(prepared.request))) {
      return refusal("outbox intent conflicts with its retained request");
    }
    return existingEvidence.delivery?.state === "acknowledged" &&
      existingEvidence.acknowledgment !== undefined
      ? refusal("outbox delivery is already acknowledged")
      : refusal("outbox delivery is uncertain");
  }

  const request = retainOutboxArtifact(
    ledger.directory(),
    "request",
    Buffer.from(prepared.request),
  );
  if (isErr(request)) return refusal("outbox request evidence could not be retained");
  const intent: OutboxIntent = {
    interlock: OUTBOX_INTENT_SHAPE,
    id,
    node,
    session,
    target: prepared.target,
    ...(prepared.repository === undefined ? {} : { repository: prepared.repository }),
    request: request.value,
    derivation: outboxDerivation(runnerId),
  };
  if (isErr(ledger.appendConfirmed({ kind: "outbox-intent-recorded", node, effect: intent }))) {
    return refusal("outbox intent could not be confirmed");
  }

  const dispatched = await substrate.dispatchAbsorb(prepared);
  if (dispatched.kind === "uncertain") {
    return recordUncertainDelivery(ledger, id, dispatched.because, runnerId)
      ? refusal(dispatched.because)
      : refusal("outbox uncertainty could not be retained");
  }
  const acknowledgment = retainOutboxArtifact(
    ledger.directory(),
    "acknowledgment",
    dispatched.response,
  );
  if (isErr(acknowledgment)) {
    recordUncertainDelivery(
      ledger,
      id,
      "absorb response was observed but acknowledgment evidence could not be retained",
      runnerId,
    );
    return refusal("absorb acknowledgment evidence could not be retained");
  }
  return recordAcknowledgedDelivery(
    ledger,
    id,
    "validated absorb response retained",
    runnerId,
    acknowledgment.value,
  )
    ? dispatched.outcome
    : refusal("absorb acknowledgment could not be retained");
}
