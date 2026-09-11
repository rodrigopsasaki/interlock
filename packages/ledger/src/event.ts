import { isBrief, type Brief } from "./brief.ts";
import { isDebrief, type Debrief } from "./debrief.ts";
import { isGate, type Gate } from "./gate.ts";
import { isNode, type Node } from "./graph.ts";
import { isNote, type Note } from "./note.ts";
import { isOutcome, type Outcome } from "./outcome.ts";
import { isReceipt, type Receipt } from "./receipt.ts";
import { isSession, type Session } from "./session.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type LedgerEvent =
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
      // Absent on events recorded before the field existed.
      readonly graphBaseSha?: string;
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
      readonly kind: "session-narrated";
      readonly session: string;
      readonly at: number;
      readonly line: string;
    };

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
      return (
        isSession(prop(value, "session")) &&
        isBrief(prop(value, "brief")) &&
        (graphBaseSha === undefined || isString(graphBaseSha))
      );
    }
    case "note-appended":
      return isString(prop(value, "session")) && isNote(prop(value, "note"));
    case "debrief-filed":
      return (
        isString(prop(value, "session")) && isDebrief(prop(value, "debrief"))
      );
    case "gate-moved":
      return (
        isNode(prop(value, "node")) &&
        isString(prop(value, "gate")) &&
        isGate(prop(value, "to"))
      );
    case "receipt-written":
      return isNode(prop(value, "node")) && isReceipt(prop(value, "receipt"));
    case "outcome-set":
      return isNode(prop(value, "node")) && isOutcome(prop(value, "outcome"));
    case "outbox-intent-recorded":
      return (
        isNode(prop(value, "node")) &&
        isString(prop(value, "id")) &&
        isString(prop(value, "intent"))
      );
    case "session-narrated":
      return (
        isString(prop(value, "session")) &&
        typeof prop(value, "at") === "number" &&
        isString(prop(value, "line"))
      );
    default:
      return false;
  }
}
