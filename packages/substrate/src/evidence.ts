import type { Item, ItemScope } from "debrief";
import type {
  DebriefDerivation,
  Decision,
  Discovery,
  LedgerEvent,
  Mark,
  Node,
  Outcome,
  Receipt,
} from "ledger";
import {
  debriefDerivationString,
  derivationString,
} from "./derivationString.ts";
import { discoveryItemKind } from "./discoveryKind.ts";
import { isString, prop } from "./validate.ts";

export interface DecisionEvidence {
  readonly decision: Decision;
  readonly marks: readonly Mark[];
}

export interface DiscoveryEvidence {
  readonly discovery: Discovery;
  readonly mark: Mark;
}

export function personEventsFor(
  node: Node,
  events: readonly LedgerEvent[],
): readonly LedgerEvent[] {
  return events.filter(
    (event) =>
      (event.kind === "gate-moved" || event.kind === "outcome-set") &&
      event.node.graph === node.graph &&
      event.node.id === node.id,
  );
}

export interface EvidenceSession {
  readonly derivation: DebriefDerivation;
  readonly decisions: readonly DecisionEvidence[];
  readonly discoveries: readonly DiscoveryEvidence[];
  readonly receipts: readonly Receipt[];
  readonly outcome: Outcome;
  readonly personEvents: readonly LedgerEvent[];
}

function hunkPath(citation: string): string {
  const trimmed = citation.trim();
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return trimmed;
  const suffix = trimmed.slice(lastColon + 1);
  return /^\d+(?:-\d+)?$/.test(suffix) ? trimmed.slice(0, lastColon) : trimmed;
}

function hunkScope(hunks: readonly string[]): ItemScope {
  const paths = [...new Set(hunks.map(hunkPath))];
  const only = paths.length === 1 ? paths[0] : undefined;
  return only === undefined
    ? { kind: "repository" }
    : { kind: "path", path: only };
}

function decisionItem(
  entry: DecisionEvidence,
  derivation: string,
): Item | undefined {
  if (
    entry.marks.length === 0 ||
    entry.marks.some((mark) => mark.kind !== "rooted")
  ) {
    return undefined;
  }
  return {
    kind: "decision",
    statement: entry.decision.what,
    because: entry.decision.because,
    scope: hunkScope(entry.decision.hunks),
    standing: "hypothesis",
    derivation,
  };
}

function discoveryItem(
  entry: DiscoveryEvidence,
  derivation: string,
): Item | undefined {
  if (entry.mark.kind !== "rooted") return undefined;
  return {
    kind: discoveryItemKind(entry.discovery),
    statement: entry.discovery.what,
    because: entry.discovery.matteredBecause,
    standing: "hypothesis",
    derivation,
  };
}

function blockedGateIds(outcome: Outcome): ReadonlySet<string> {
  if (outcome.kind !== "held" || outcome.on.kind !== "gate-failure")
    return new Set();
  return new Set(outcome.on.failure.split(", "));
}

function receiptItem(receipt: Receipt, blocked: ReadonlySet<string>): Item {
  const satisfied = !blocked.has(receipt.gate);
  return {
    kind: satisfied ? "discipline" : "risk",
    statement: `gate ${receipt.gate} ${satisfied ? "satisfied" : "blocked"}`,
    standing: "observed",
    derivation: derivationString(receipt.derivation),
  };
}

function proofBecause(
  proof: Readonly<Record<string, unknown>>,
): string | undefined {
  const value = prop(proof, "because");
  return isString(value) ? value : undefined;
}

function personVerbItem(event: LedgerEvent): Item | undefined {
  if (event.kind === "gate-moved") {
    if (event.to.kind === "waived") {
      return {
        kind: "decision",
        statement: `waived gate ${event.gate}`,
        because: event.to.because,
        standing: "professed",
        derivation: `human:${event.to.authority}`,
      };
    }
    if (
      event.to.kind === "satisfied" &&
      event.to.receipt.derivation.kind === "human"
    ) {
      const because = proofBecause(event.to.receipt.proof);
      if (because === undefined) return undefined;
      return {
        kind: "decision",
        statement: `approved gate ${event.gate}`,
        because,
        standing: "professed",
        derivation: `human:${event.to.receipt.derivation.who}`,
      };
    }
    return undefined;
  }
  if (event.kind === "outcome-set") {
    if (event.outcome.kind === "cancelled") {
      return {
        kind: "decision",
        statement: "cancelled this node",
        because: event.outcome.because,
        standing: "professed",
        derivation: `human:${event.outcome.authority}`,
      };
    }
    if (event.outcome.kind === "reset") {
      return {
        kind: "decision",
        statement: "reset this node",
        because: event.outcome.because,
        standing: "professed",
        derivation: `human:${event.outcome.authority}`,
      };
    }
    return undefined;
  }
  return undefined;
}

function isItem(value: Item | undefined): value is Item {
  return value !== undefined;
}

export function evidenceOf(session: EvidenceSession): readonly Item[] {
  const derivation = debriefDerivationString(session.derivation);

  const blocked = blockedGateIds(session.outcome);
  const receiptItems = session.receipts.map((receipt) =>
    receiptItem(receipt, blocked),
  );
  const decisionItems = session.decisions
    .map((entry) => decisionItem(entry, derivation))
    .filter(isItem);
  const discoveryItems = session.discoveries
    .map((entry) => discoveryItem(entry, derivation))
    .filter(isItem);
  const personItems = session.personEvents.map(personVerbItem).filter(isItem);

  return [...receiptItems, ...decisionItems, ...discoveryItems, ...personItems];
}
