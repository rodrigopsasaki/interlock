import { type Brief, isBrief } from "./brief.ts";
import { type Debrief, isDebrief } from "./debrief.ts";
import { type Derivation, isDerivation } from "./derivation.ts";
import { type Gate, isGate } from "./gate.ts";
import { isNode, type Node } from "./graph.ts";
import { isMarkCounts, type MarkCounts } from "./mark.ts";
import { isNote, type Note } from "./note.ts";
import {
  isOutboxDelivery,
  isOutboxIntent,
  type OutboxDelivery,
  type OutboxIntent,
} from "./outbox.ts";
import { isOutcome, type Outcome } from "./outcome.ts";
import { isPersonSaid, type PersonSaid } from "./personSaid.ts";
import { isReceipt, type Receipt } from "./receipt.ts";
import { isEpochMs, isSession, isSessionRuntime, type Session, sessionRuntime } from "./session.ts";
import { isSessionFacts, type SessionFacts } from "./sessionFacts.ts";
import { isRecord, isString, prop } from "./validate.ts";
import { isWalk, type Walk } from "./walk.ts";

type BaseLedgerEvent =
  | { readonly kind: "node-created"; readonly node: Node }
  | {
      readonly kind: "lease-taken";
      readonly node: Node;
      readonly session: string;
      readonly expiry: number;
    }
  | {
      readonly kind: "lease-renewed";
      readonly node: Node;
      readonly session: string;
      readonly expiry: number;
    }
  | {
      readonly kind: "lease-expired";
      readonly node: Node;
      readonly session: string;
    }
  | {
      readonly kind: "session-started";
      readonly session: Session;
      readonly brief: Brief;
      readonly graphBaseSha?: string;
      readonly inheritedStartSha?: string;
      readonly predecessorSession?: string;
      readonly walk?: Walk;
      readonly startedAt?: number;
    }
  | {
      readonly kind: "note-appended";
      readonly session: string;
      readonly note: Note;
    }
  | {
      readonly kind: "debrief-filed";
      readonly session: string;
      readonly debrief: Debrief;
      readonly markCounts?: MarkCounts;
    }
  | {
      readonly kind: "gate-moved";
      readonly node: Node;
      readonly gate: string;
      readonly to: Gate;
    }
  | {
      readonly kind: "receipt-written";
      readonly node: Node;
      readonly receipt: Receipt;
    }
  | {
      readonly kind: "outcome-set";
      readonly node: Node;
      readonly outcome: Outcome;
    }
  | {
      readonly kind: "outbox-intent-recorded";
      readonly node: Node;
      readonly id: string;
      readonly intent: string;
    }
  | {
      readonly kind: "outbox-intent-recorded";
      readonly node: Node;
      readonly effect: OutboxIntent;
    }
  | {
      readonly kind: "outbox-delivery-recorded";
      readonly delivery: OutboxDelivery;
    }
  | {
      readonly kind: "session-narrated";
      readonly session: string;
      readonly at: number;
      readonly line: string;
    }
  | {
      readonly kind: "session-facts-observed";
      readonly session: string;
      readonly facts: SessionFacts;
    }
  | {
      readonly kind: "person-said";
      readonly session: string;
      readonly said: PersonSaid;
    }
  | {
      readonly kind: "receipt-retracted";
      readonly node: Node;
      readonly gate: string;
      readonly receiptId: string;
      readonly by: string;
      readonly because: string;
    };

export type ProbeCheckResult =
  | { readonly check: string; readonly state: "passed"; readonly fingerprint?: string }
  | { readonly check: string; readonly state: "refused"; readonly error: string }
  | { readonly check: string; readonly state: "unavailable"; readonly reason: string };

export interface ProbeEvent {
  readonly kind: "probe";
  readonly probeId: string;
  readonly profile: string;
  readonly configuration: string;
  readonly implementationVersion: string;
  readonly checks: readonly ProbeCheckResult[];
  readonly signedCommitKeyFingerprint?: string;
  readonly derivation: Derivation;
  readonly at: number;
}

export type LedgerEvent = BaseLedgerEvent | ProbeEvent;

export function isLedgerEvent(value: unknown): value is LedgerEvent {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "node-created":
      return isNode(prop(value, "node"));
    case "lease-taken":
    case "lease-renewed":
      return (
        isNode(prop(value, "node")) &&
        isString(prop(value, "session")) &&
        typeof prop(value, "expiry") === "number"
      );
    case "lease-expired":
      return isNode(prop(value, "node")) && isString(prop(value, "session"));
    case "session-started": {
      const graphBaseSha = prop(value, "graphBaseSha");
      const inheritedStartSha = prop(value, "inheritedStartSha");
      const predecessorSession = prop(value, "predecessorSession");
      const walk = prop(value, "walk");
      const startedAt = prop(value, "startedAt");
      return (
        isSession(prop(value, "session")) &&
        isBrief(prop(value, "brief")) &&
        (graphBaseSha === undefined || isString(graphBaseSha)) &&
        (inheritedStartSha === undefined || isString(inheritedStartSha)) &&
        (predecessorSession === undefined || isString(predecessorSession)) &&
        (walk === undefined || isWalk(walk)) &&
        (startedAt === undefined || isEpochMs(startedAt))
      );
    }
    case "note-appended":
      return isString(prop(value, "session")) && isNote(prop(value, "note"));
    case "debrief-filed": {
      const markCounts = prop(value, "markCounts");
      return (
        isString(prop(value, "session")) &&
        isDebrief(prop(value, "debrief")) &&
        (markCounts === undefined || isMarkCounts(markCounts))
      );
    }
    case "gate-moved":
      return (
        isNode(prop(value, "node")) && isString(prop(value, "gate")) && isGate(prop(value, "to"))
      );
    case "receipt-written":
      return isNode(prop(value, "node")) && isReceipt(prop(value, "receipt"));
    case "outcome-set":
      return isNode(prop(value, "node")) && isOutcome(prop(value, "outcome"));
    case "outbox-intent-recorded":
      return (
        isNode(prop(value, "node")) &&
        ((isString(prop(value, "id")) && isString(prop(value, "intent"))) ||
          isOutboxIntent(prop(value, "effect")))
      );
    case "outbox-delivery-recorded":
      return isOutboxDelivery(prop(value, "delivery"));
    case "session-narrated":
      return (
        isString(prop(value, "session")) &&
        typeof prop(value, "at") === "number" &&
        isString(prop(value, "line"))
      );
    case "session-facts-observed":
      return isString(prop(value, "session")) && isSessionFacts(prop(value, "facts"));
    case "person-said":
      return isString(prop(value, "session")) && isPersonSaid(prop(value, "said"));
    case "receipt-retracted":
      return (
        isNode(prop(value, "node")) &&
        isString(prop(value, "gate")) &&
        isString(prop(value, "receiptId")) &&
        isString(prop(value, "by")) &&
        isString(prop(value, "because"))
      );
    case "probe": {
      const checks = prop(value, "checks");
      return (
        isString(prop(value, "probeId")) &&
        isString(prop(value, "profile")) &&
        isString(prop(value, "configuration")) &&
        isString(prop(value, "implementationVersion")) &&
        Array.isArray(checks) &&
        checks.every(isProbeCheckResult) &&
        isDerivation(prop(value, "derivation")) &&
        typeof prop(value, "at") === "number" &&
        (prop(value, "signedCommitKeyFingerprint") === undefined ||
          isString(prop(value, "signedCommitKeyFingerprint")))
      );
    }
    default:
      return false;
  }
}

function isProbeCheckResult(value: unknown): value is ProbeCheckResult {
  if (!isRecord(value) || !isString(prop(value, "check"))) return false;
  const state = prop(value, "state");
  if (state === "passed") return true;
  return state === "refused"
    ? isString(prop(value, "error"))
    : state === "unavailable" && isString(prop(value, "reason"));
}

function isLegacySessionRecord(value: unknown): value is Record<string, unknown> & {
  readonly id: string;
  readonly node: Node;
} {
  return isRecord(value) && isString(prop(value, "id")) && isNode(prop(value, "node"));
}

export function upcastSessionStarted(raw: unknown): LedgerEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const session = prop(raw, "session");
  const brief = prop(raw, "brief");
  const graphBaseSha = prop(raw, "graphBaseSha");
  const inheritedStartSha = prop(raw, "inheritedStartSha");
  const predecessorSession = prop(raw, "predecessorSession");
  if (!isLegacySessionRecord(session) || !isBrief(brief)) return undefined;
  if (graphBaseSha !== undefined && !isString(graphBaseSha)) return undefined;
  if (inheritedStartSha !== undefined && !isString(inheritedStartSha)) return undefined;
  if (predecessorSession !== undefined && !isString(predecessorSession)) return undefined;
  const runtimeField = prop(session, "runtime");
  const runtime = isSessionRuntime(runtimeField) ? runtimeField : sessionRuntime.unknown();
  return {
    kind: "session-started",
    session: { id: session.id, node: session.node, runtime },
    brief,
    ...(graphBaseSha === undefined ? {} : { graphBaseSha }),
    ...(inheritedStartSha === undefined ? {} : { inheritedStartSha }),
    ...(predecessorSession === undefined ? {} : { predecessorSession }),
  };
}

export function upcastPreV5Event(raw: unknown): LedgerEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = prop(raw, "kind");
  if (kind === "session-started") return upcastSessionStarted(raw);
  if (kind === "outbox-delivery-recorded") return undefined;
  if (!isLedgerEvent(raw)) return undefined;
  if (raw.kind === "outbox-intent-recorded" && "effect" in raw) return undefined;
  return raw;
}
