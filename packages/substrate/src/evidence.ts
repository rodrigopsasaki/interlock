import type { Item, ItemScope } from "debrief";
import type {
  DebriefDerivation,
  Decision,
  Discovery,
  Gap,
  LedgerEvent,
  Mark,
  Node,
  Receipt,
} from "ledger";
import type { EvidenceForAbsorb } from "./client.ts";
import { debriefDerivationString, derivationString } from "./derivationString.ts";
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
  return events.filter((event) => {
    if (event.kind !== "gate-moved" && event.kind !== "outcome-set") return false;
    if (event.node.graph !== node.graph) return false;
    if (event.node.id === node.id) return true;
    return event.node.id === node.graph && event.kind === "gate-moved" && event.gate === "approved";
  });
}

export interface EvidenceSession {
  readonly derivation: DebriefDerivation;
  readonly decisions: readonly DecisionEvidence[];
  readonly discoveries: readonly DiscoveryEvidence[];
  readonly receipts: readonly Receipt[];
  readonly personEvents: readonly LedgerEvent[];
  readonly harnessAuthorities: ReadonlySet<string>;
}

const SENTINEL_HUNKS: ReadonlySet<string> = new Set(["command", "out-of-band citation"]);

function hunkPath(citation: string): string {
  const trimmed = citation.trim();
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon === -1) return trimmed;
  const suffix = trimmed.slice(lastColon + 1);
  return /^\d+(?:-\d+)?$/.test(suffix) ? trimmed.slice(0, lastColon) : trimmed;
}

function hunkScope(hunks: readonly string[]): {
  readonly scope: ItemScope;
  readonly paths: readonly string[];
} {
  const paths = [...new Set(hunks.map(hunkPath))];
  const only = paths.length === 1 ? paths[0] : undefined;
  return only === undefined
    ? { scope: { kind: "repository" }, paths }
    : { scope: { kind: "path", path: only }, paths };
}

interface DecisionResult {
  readonly item: Item;
  readonly gap?: Gap;
}

function decisionResult(entry: DecisionEvidence, derivation: string): DecisionResult | undefined {
  if (entry.marks.length === 0 || entry.marks.some((mark) => mark.kind !== "rooted")) {
    return undefined;
  }
  const { scope, paths } = hunkScope(entry.decision.hunks);
  const item: Item = {
    kind: "decision",
    statement: entry.decision.what,
    because: entry.decision.because,
    scope,
    standing: "hypothesis",
    derivation,
  };
  if (paths.length <= 1) return { item };
  return {
    item,
    gap: {
      term: `decision ${entry.decision.id} scope`,
      nearest: "path",
      difference: `cites ${paths.length} paths (${paths.join(", ")}); item@v1's scope carries only one, so this item is scoped to the repository instead`,
    },
  };
}

function discoveryItem(entry: DiscoveryEvidence, derivation: string): Item | undefined {
  if (entry.mark.kind !== "rooted") return undefined;
  const scope: ItemScope = SENTINEL_HUNKS.has(entry.mark.hunk)
    ? { kind: "repository" }
    : { kind: "path", path: entry.mark.hunk };
  return {
    kind: discoveryItemKind(entry.discovery),
    statement: entry.discovery.what,
    because: entry.discovery.matteredBecause,
    scope,
    standing: "hypothesis",
    derivation,
  };
}

function satisfiedReceiptIds(events: readonly LedgerEvent[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.kind !== "gate-moved") continue;
    if (event.to.kind === "satisfied" || event.to.kind === "waived") {
      ids.add(event.to.receipt.id);
    }
  }
  return ids;
}

function receiptItem(receipt: Receipt, satisfied: ReadonlySet<string>): Item {
  const ok = satisfied.has(receipt.id);
  return {
    kind: ok ? "discipline" : "risk",
    statement: `gate ${receipt.gate} ${ok ? "satisfied" : "blocked"}`,
    standing: "observed",
    derivation: derivationString(receipt.derivation),
  };
}

function proofBecause(proof: Readonly<Record<string, unknown>>): string | undefined {
  const value = prop(proof, "because");
  return isString(value) ? value : undefined;
}

function personVerbItem(
  event: LedgerEvent,
  harnessAuthorities: ReadonlySet<string>,
): Item | undefined {
  if (event.kind === "gate-moved") {
    if (event.to.kind === "waived") {
      if (harnessAuthorities.has(event.to.authority)) return undefined;
      return {
        kind: "decision",
        statement: `waived gate ${event.gate}`,
        because: event.to.because,
        standing: "professed",
        derivation: `human:${event.to.authority}`,
      };
    }
    if (event.to.kind === "satisfied" && event.to.receipt.derivation.kind === "human") {
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
      if (harnessAuthorities.has(event.outcome.authority)) return undefined;
      return {
        kind: "decision",
        statement: "cancelled this node",
        because: event.outcome.because,
        standing: "professed",
        derivation: `human:${event.outcome.authority}`,
      };
    }
    if (event.outcome.kind === "reset") {
      if (harnessAuthorities.has(event.outcome.authority)) return undefined;
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

function isDecisionResult(value: DecisionResult | undefined): value is DecisionResult {
  return value !== undefined;
}

export function evidenceOf(session: EvidenceSession): EvidenceForAbsorb {
  const derivation = debriefDerivationString(session.derivation);

  const satisfied = satisfiedReceiptIds(session.personEvents);
  const receiptItems = session.receipts.map((receipt) => receiptItem(receipt, satisfied));

  const decisionResults = session.decisions
    .map((entry) => decisionResult(entry, derivation))
    .filter(isDecisionResult);
  const decisionItems = decisionResults.map((result) => result.item);
  const decisionGaps = decisionResults.flatMap((result) =>
    result.gap === undefined ? [] : [result.gap],
  );

  const discoveryItems = session.discoveries
    .map((entry) => discoveryItem(entry, derivation))
    .filter(isItem);

  const personItems = session.personEvents
    .map((event) => personVerbItem(event, session.harnessAuthorities))
    .filter(isItem);

  return {
    items: [...receiptItems, ...decisionItems, ...discoveryItems, ...personItems],
    gaps: decisionGaps,
  };
}
