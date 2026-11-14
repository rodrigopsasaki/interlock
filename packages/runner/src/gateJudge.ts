import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
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
  commandReceiptId,
  countMarks,
  createReceipt,
  type Debrief,
  derivation,
  duration,
  explainScopeRefusal,
  type Gap,
  type Gate,
  gate,
  HARNESS_AUTHORITIES,
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
  type ScopeInput,
  type ScopeRefusal,
  spend,
} from "ledger";
import {
  type AbsorbNarration,
  type AbsorbOutcome,
  type EvidenceForAbsorb,
  type EvidenceSession,
  evidenceOf,
  narrateAbsorb,
  personEventsFor,
  type SubstrateClient,
} from "substrate";
import { verifyDebrief } from "verifier";
import { type ContextSlice, contextSlice } from "./contextSlice.ts";
import { type GateCommand, type PlaceholderRefusal, substituteGateCommand } from "./gateCommand.ts";
import {
  explainGateOutputRefusal,
  type GateOutputRefusal,
  retainGateOutput,
  storeGateOutput,
} from "./gateOutput.ts";
import { checkNodeEngine, type NodeVersionRunner } from "./nodeEngine.ts";
import { nonInteractiveEnvironment, runOwnedCommandWithTimeout } from "./ownedCommand.ts";
import { appendUnrecordedNotes } from "./questionNotes.ts";

export const DEFAULT_GATE_HOLD_TIMEOUT_MS = 60 * 60 * 1000;

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
  readonly scopePaths: ScopeInput;
  readonly commitSha: string;
  readonly runnerId: string;
  readonly holdMs: number;
  readonly holdTimeoutMs?: number;
  readonly substrate: SubstrateClient;
  readonly personEvents?: readonly LedgerEvent[];
  readonly env?: NodeJS.ProcessEnv;
  readonly heavy?: readonly string[];
  readonly nodeVersionRunner?: NodeVersionRunner;
  readonly commandRunner?: GateCommandRunner;
  readonly outputDirectory?: string;
  readonly narrate: (line: string) => void;
  readonly authoritativeGraphPath: string;
  readonly parsedGraphHash: string;
}

export interface GateCommandResult {
  readonly exitCode: number;
  readonly output: string;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly timedOut?: boolean;
}

export type GateCommandRunner = (
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
) => Promise<GateCommandResult>;

type LegacyGateJudgeRequest = Omit<
  GateJudgeRequest,
  "authoritativeGraphPath" | "parsedGraphHash"
> & {
  readonly authoritativeGraphPath?: string;
  readonly parsedGraphHash?: string;
};

export function legacyOutputForChunk(chunk: Buffer): string {
  return chunk.toString("utf-8");
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

async function spawnGateCommand(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<GateCommandResult> {
  const bin = argv[0];
  if (bin === undefined) {
    const output = "no command configured for this gate";
    return { exitCode: -1, output, stdout: Buffer.alloc(0), stderr: Buffer.from(output) };
  }
  const result = await runOwnedCommandWithTimeout(argv, cwd, env, timeoutMs);
  return {
    exitCode: result.code,
    output: result.output,
    stdout: Buffer.from(result.stdout),
    stderr: Buffer.from(result.stderr),
    timedOut: result.timedOut,
  };
}

function lastOutputLines(output: string): string {
  const lines = output
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0);
  return lines.slice(-8).join(" | ") || "(no output)";
}

function timeoutLine(command: string, timeoutMs: number, output: string, retained: string): string {
  return `gate command "${command}" timed out after ${timeoutMs}ms; last output: ${lastOutputLines(output)}; retained log: ${retained}`;
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

async function graphHash(path: string): Promise<string | undefined> {
  try {
    return createHash("sha256")
      .update(await readFile(path))
      .digest("hex");
  } catch {
    return undefined;
  }
}

function delegatedReceiptContentHash(receipt: Receipt): string | undefined {
  if (receipt.derivation.kind !== "human" || !("contentHash" in receipt.derivation)) {
    return undefined;
  }
  return receipt.derivation.contentHash;
}

function delegatedContentHash(gateValue: Gate): string | undefined {
  return gateValue.kind === "satisfied"
    ? delegatedReceiptContentHash(gateValue.receipt)
    : undefined;
}

async function invalidateStaleDelegated(
  ledger: Ledger,
  node: Node,
  declaredGateIds: readonly string[],
  commandFor: ReadonlyMap<string, GateCommand>,
  worktree: string,
  authoritativeGraphPath: string,
  parsedGraphHash: string | undefined,
  narrate: (line: string) => void,
): Promise<readonly string[]> {
  const authoritativeHash = await graphHash(authoritativeGraphPath);
  const worktreeHash = await graphHash(
    join(worktree, ".interlock", "graphs", `${node.graph}.yaml`),
  );
  const view = ledger.projection().nodes.get(nodeKey(node));
  const stale: string[] = [];

  for (const gateId of declaredGateIds) {
    const current = view?.gates.get(gateId);
    let boundHash = current === undefined ? undefined : delegatedContentHash(current);
    if (boundHash === undefined && current?.kind === "pending") {
      const historical = view?.receipts.find(
        (receipt) =>
          receipt.gate === gateId &&
          !ledger.projection().retractedReceipts.has(receipt.id) &&
          delegatedReceiptContentHash(receipt) !== undefined,
      );
      const historicalHash =
        historical === undefined ? undefined : delegatedReceiptContentHash(historical);
      if (
        historical !== undefined &&
        historicalHash !== undefined &&
        authoritativeHash === historicalHash &&
        worktreeHash === historicalHash &&
        parsedGraphHash === historicalHash
      ) {
        ledger.append({
          kind: "gate-moved",
          node,
          gate: gateId,
          to: gate.satisfied(historical),
        });
        boundHash = historicalHash;
      } else if (historicalHash !== undefined) {
        stale.push(gateId);
      }
    }
    if (
      boundHash !== undefined &&
      (authoritativeHash !== boundHash ||
        worktreeHash !== boundHash ||
        parsedGraphHash !== boundHash)
    ) {
      stale.push(gateId);
    }
  }

  for (const gateId of stale) {
    const current = ledger.projection().nodes.get(nodeKey(node))?.gates.get(gateId);
    if (current === undefined) continue;
    const moved = proposeGateMove(declaredGateIds, gateId, current, gate.pending());
    if (isOk(moved)) ledger.append({ kind: "gate-moved", node, gate: gateId, to: moved.value });
    if (commandFor.get(gateId)?.kind === "human") narrate(`${gateId}: awaits a person`);
  }
  return stale;
}

function holdOnStaleDelegation(
  ledger: Ledger,
  clock: Clock,
  node: Node,
  stale: readonly string[],
  commandFor: ReadonlyMap<string, GateCommand>,
  holdMs: number,
): void {
  if (stale.length === 0) return;
  const receipts = ledger.projection().nodes.get(nodeKey(node))?.receipts ?? [];
  ledger.append({
    kind: "outcome-set",
    node,
    outcome: outcome.held(
      receipts,
      heldOn.gateFailure(stale.join(", "), "hold"),
      heldBecause(stale, commandFor),
      clock.now().wallMs + holdMs,
    ),
  });
}

export async function judgeGates(
  request: GateJudgeRequest,
): Promise<Result<Outcome, GateJudgeRefusal>>;
export async function judgeGates(
  request: LegacyGateJudgeRequest,
): Promise<Result<Outcome, GateJudgeRefusal>>;
export async function judgeGates(
  request: GateJudgeRequest | LegacyGateJudgeRequest,
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
    holdTimeoutMs = DEFAULT_GATE_HOLD_TIMEOUT_MS,
    substrate,
    personEvents = [],
    env = process.env,
    heavy = [],
    nodeVersionRunner,
    outputDirectory,
    narrate,
  } = request;
  const commandRunner =
    request.commandRunner ??
    ((argv: readonly string[], cwd: string, commandEnv: NodeJS.ProcessEnv) =>
      spawnGateCommand(argv, cwd, commandEnv, holdTimeoutMs));
  const commandEnv = nonInteractiveEnvironment(env);
  const versionRunner =
    nodeVersionRunner ??
    (async (argv: readonly string[], versionCwd: string, versionEnv: NodeJS.ProcessEnv) => {
      const result = await runOwnedCommandWithTimeout(argv, versionCwd, versionEnv, holdTimeoutMs);
      return ok({
        code: result.code,
        signal: result.signal,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    });
  const authoritativeGraphPath =
    request.authoritativeGraphPath ?? join(worktree, ".interlock", "graphs", `${node.graph}.yaml`);
  const parsedGraphHash = request.parsedGraphHash;

  const gateMovedThisRun: LedgerEvent[] = [];
  let nodeEngineChecked = false;

  await invalidateStaleDelegated(
    ledger,
    node,
    declaredGateIds,
    commandFor,
    worktree,
    authoritativeGraphPath,
    parsedGraphHash,
    narrate,
  );

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

    if (!nodeEngineChecked) {
      const nodeEngine = await checkNodeEngine(worktree, "gate", commandEnv, heavy, versionRunner);
      if (isErr(nodeEngine)) {
        narrate(nodeEngine.error.because);
        const held = outcome.held(
          [],
          heldOn.gateFailure(nodeEngine.error.because, "hold"),
          nodeEngine.error.because,
          clock.now().wallMs + holdMs,
        );
        ledger.append({ kind: "outcome-set", node, outcome: held });
        return ok(held);
      }
      nodeEngineChecked = true;
    }

    const substituted = substituteGateCommand(gateCommand?.run ?? "", node);
    if (isErr(substituted)) {
      const stale = await invalidateStaleDelegated(
        ledger,
        node,
        declaredGateIds,
        commandFor,
        worktree,
        authoritativeGraphPath,
        parsedGraphHash,
        narrate,
      );
      holdOnStaleDelegation(ledger, clock, node, stale, commandFor, holdMs);
      return err({ kind: "placeholder", gateId, refusal: substituted.error });
    }

    const before = clock.now().monoMs;
    const {
      exitCode,
      output,
      stdout,
      stderr,
      timedOut = false,
    } = await commandRunner(
      [...heavy, "mise", "exec", "--", ...tokenize(substituted.value)],
      worktree,
      commandEnv,
    );
    const after = clock.now().monoMs;

    const pattern = gateCommand?.expectOutput;
    const outputMatched = pattern === undefined ? undefined : pattern.test(output);
    const satisfied = exitCode === 0 && (outputMatched ?? true);
    const proof =
      pattern === undefined
        ? { exitCode, outputHash: outputHash(output) }
        : {
            exitCode,
            outputHash: outputHash(output),
            outputMatched,
            pattern: pattern.source,
          };

    const retained =
      outputDirectory === undefined
        ? await retainGateOutput(worktree, stdout, stderr)
        : await storeGateOutput(outputDirectory, stdout, stderr);
    if (isErr(retained)) {
      const stale = await invalidateStaleDelegated(
        ledger,
        node,
        declaredGateIds,
        commandFor,
        worktree,
        authoritativeGraphPath,
        parsedGraphHash,
        narrate,
      );
      holdOnStaleDelegation(ledger, clock, node, stale, commandFor, holdMs);
      return err({ kind: "output", refusal: retained.error });
    }
    const timeout = timedOut
      ? timeoutLine(
          substituted.value,
          holdTimeoutMs,
          output,
          `${retained.value.stdout.artifact}, ${retained.value.stderr.artifact}`,
        )
      : undefined;
    if (timeout !== undefined) narrate(timeout);
    const proofWithOutput = { ...proof, gateOutput: retained.value };

    const commandId = await commandReceiptId(scopeRoot, scopePaths, gateId, proofWithOutput);
    if (isErr(commandId)) {
      const stale = await invalidateStaleDelegated(
        ledger,
        node,
        declaredGateIds,
        commandFor,
        worktree,
        authoritativeGraphPath,
        parsedGraphHash,
        narrate,
      );
      holdOnStaleDelegation(ledger, clock, node, stale, commandFor, holdMs);
      return err({ kind: "scope", refusal: commandId.error });
    }

    let built: Awaited<ReturnType<typeof createReceipt>>;
    try {
      built = await createReceipt(
        scopeRoot,
        scopePaths,
        gateId,
        commitSha,
        spend.none(),
        duration.measured(elapsedSince(after, before)),
        derivation.gate(gateId, GATE_DERIVATION_VERSION, runnerId),
        proofWithOutput,
      );
    } catch {
      const stale = await invalidateStaleDelegated(
        ledger,
        node,
        declaredGateIds,
        commandFor,
        worktree,
        authoritativeGraphPath,
        parsedGraphHash,
        narrate,
      );
      holdOnStaleDelegation(ledger, clock, node, stale, commandFor, holdMs);
      return err({
        kind: "scope",
        refusal: { kind: "unreadable", path: scopeRoot },
      });
    }
    if (isErr(built)) {
      const stale = await invalidateStaleDelegated(
        ledger,
        node,
        declaredGateIds,
        commandFor,
        worktree,
        authoritativeGraphPath,
        parsedGraphHash,
        narrate,
      );
      holdOnStaleDelegation(ledger, clock, node, stale, commandFor, holdMs);
      return err({ kind: "scope", refusal: built.error });
    }
    const receipt = { ...built.value, id: commandId.value };

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
          timeout ?? `receipt ${effectiveReceipt.id}, ${unmetCriterion(exitCode, pattern)}`,
          `${gateId}: ${timeout ?? unmetCriterion(exitCode, pattern)}`,
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

  await invalidateStaleDelegated(
    ledger,
    node,
    declaredGateIds,
    commandFor,
    worktree,
    authoritativeGraphPath,
    parsedGraphHash,
    narrate,
  );
  const finalView = ledger.projection().nodes.get(nodeKey(node));
  const gates = new Map(finalView?.gates ?? new Map<string, Gate>());
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
  const read = await readV2Debrief(worktree, node);
  if (read === undefined) return;

  const filed = ledger.projection().sessions.get(session)?.debrief;
  if (filed !== undefined && isDeepStrictEqual(filed, read.debrief)) return;

  const verified = await verifyDebrief(worktree, read.debrief);
  ledger.append({
    kind: "debrief-filed",
    session,
    debrief: read.debrief,
    ...(isErr(verified) ? {} : { markCounts: countMarks(verified.value.marks) }),
  });
  if (filed !== undefined) return;

  appendUnrecordedNotes(ledger, session, read.notes);
}

interface AbsorbEvidence {
  readonly request: EvidenceForAbsorb | undefined;
  readonly narration: Extract<AbsorbNarration["translation"], { readonly kind: "observed" }>;
}

async function evidenceForAbsorb(
  worktree: string,
  debrief: Debrief,
  receipts: readonly Receipt[],
  node: Node,
  personEvents: readonly LedgerEvent[],
): Promise<AbsorbEvidence> {
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
  const translated = { items: evidence.items, gaps };
  return {
    request: translated.items.length === 0 && translated.gaps.length === 0 ? undefined : translated,
    narration: { kind: "observed", itemCount: translated.items.length, gaps: translated.gaps },
  };
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
    evidence.request,
  );
  const briefRead = await readBriefFile(briefFilePath(worktree, node.graph, node.id));
  const slice: ContextSlice =
    !isErr(briefRead) && briefRead.value.kind === "v1"
      ? contextSlice(briefRead.value.body)
      : { kind: "absent" };
  narrate(
    narrateAbsorb(substrate.address, acknowledged, {
      translation: evidence.narration,
      slice:
        slice.kind === "present"
          ? { kind: "present", body: slice.body, discoveries: read.debrief.discoveries }
          : { kind: "unavailable" },
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
