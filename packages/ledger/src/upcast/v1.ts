import { isDerivation, type Derivation } from "../derivation.ts";
import { isDisposition, type Disposition } from "../disposition.ts";
import { isLedgerEvent, type LedgerEvent } from "../event.ts";
import { gate, type Gate } from "../gate.ts";
import { isNode } from "../graph.ts";
import { heldOn, outcome, type Outcome } from "../outcome.ts";
import { duration, type Receipt } from "../receipt.ts";
import { isSpend, type Spend } from "../spend.ts";
import { isRecord, isString, prop } from "../validate.ts";

// event@v1's own shapes, frozen at the point this session found them: no receipt duration, no
// data on held, no authority or because on reset. Kept here only to upcast, never exported.

interface V1Receipt {
  readonly id: string;
  readonly gate: string;
  readonly commitSha: string;
  readonly spend: Spend;
  readonly derivation: Derivation;
  readonly proof: Readonly<Record<string, unknown>>;
}

function isV1Receipt(value: unknown): value is V1Receipt {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "gate")) &&
    isString(prop(value, "commitSha")) &&
    isSpend(prop(value, "spend")) &&
    isDerivation(prop(value, "derivation")) &&
    isRecord(prop(value, "proof"))
  );
}

function upcastReceipt(v1: V1Receipt): Receipt {
  return { ...v1, duration: duration.unknown() };
}

type V1Gate =
  | { readonly kind: "pending" }
  | { readonly kind: "satisfied"; readonly receipt: V1Receipt }
  | {
      readonly kind: "blocked";
      readonly evidence: string;
      readonly because: string;
    }
  | {
      readonly kind: "waived";
      readonly authority: string;
      readonly because: string;
      readonly receipt: V1Receipt;
    }
  | {
      readonly kind: "superseded";
      readonly authority: string;
      readonly because: string;
    };

function isV1Gate(value: unknown): value is V1Gate {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "pending":
      return true;
    case "satisfied":
      return isV1Receipt(prop(value, "receipt"));
    case "blocked":
      return (
        isString(prop(value, "evidence")) && isString(prop(value, "because"))
      );
    case "waived":
      return (
        isString(prop(value, "authority")) &&
        isString(prop(value, "because")) &&
        isV1Receipt(prop(value, "receipt"))
      );
    case "superseded":
      return (
        isString(prop(value, "authority")) && isString(prop(value, "because"))
      );
    default:
      return false;
  }
}

function upcastGate(v1: V1Gate): Gate {
  switch (v1.kind) {
    case "satisfied":
      return gate.satisfied(upcastReceipt(v1.receipt));
    case "waived":
      return gate.waived(v1.authority, v1.because, upcastReceipt(v1.receipt));
    default:
      return v1;
  }
}

type V1Outcome =
  | { readonly kind: "cleared"; readonly receipts: readonly V1Receipt[] }
  | {
      readonly kind: "held";
      readonly receipts: readonly V1Receipt[];
      readonly failure: string;
      readonly disposition: Disposition;
      readonly because: string;
      readonly expiry: number;
    }
  | { readonly kind: "reset"; readonly receipts: readonly V1Receipt[] }
  | {
      readonly kind: "failed";
      readonly receipts: readonly V1Receipt[];
      readonly failure: string;
      readonly disposition: Disposition;
      readonly because: string;
    }
  | {
      readonly kind: "cancelled";
      readonly receipts: readonly V1Receipt[];
      readonly authority: string;
      readonly because: string;
    }
  | {
      readonly kind: "superseded";
      readonly receipts: readonly V1Receipt[];
      readonly authority: string;
      readonly because: string;
    };

function isV1ReceiptArray(value: unknown): value is readonly V1Receipt[] {
  return Array.isArray(value) && value.every(isV1Receipt);
}

function isV1Outcome(value: unknown): value is V1Outcome {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  const receipts = prop(value, "receipts");
  if (typeof kind !== "string" || !isV1ReceiptArray(receipts)) return false;
  switch (kind) {
    case "cleared":
    case "reset":
      return true;
    case "held":
      return (
        isString(prop(value, "failure")) &&
        isDisposition(prop(value, "disposition")) &&
        isString(prop(value, "because")) &&
        typeof prop(value, "expiry") === "number"
      );
    case "failed":
      return (
        isString(prop(value, "failure")) &&
        isDisposition(prop(value, "disposition")) &&
        isString(prop(value, "because"))
      );
    case "cancelled":
    case "superseded":
      return (
        isString(prop(value, "authority")) && isString(prop(value, "because"))
      );
    default:
      return false;
  }
}

// v1's `reset` recorded no authority or because; nothing honest can be synthesized, so a v1
// reset event is refused rather than upcast with an invented reason. A v1 `held` always meant
// waiting on a failed gate -- v1 had no other kind of hold -- so that upcast is lossless.
function upcastOutcome(v1: V1Outcome): Outcome | undefined {
  const receipts = v1.receipts.map(upcastReceipt);
  switch (v1.kind) {
    case "cleared":
      return { kind: "cleared", receipts };
    case "held":
      return outcome.held(
        receipts,
        heldOn.gateFailure(v1.failure, v1.disposition),
        v1.because,
        v1.expiry,
      );
    case "reset":
      return undefined;
    case "failed":
      return outcome.failed(receipts, v1.failure, v1.disposition, v1.because);
    case "cancelled":
      return outcome.cancelled(receipts, v1.authority, v1.because);
    case "superseded":
      return outcome.superseded(receipts, v1.authority, v1.because);
  }
}

const PASS_THROUGH_KINDS: ReadonlySet<string> = new Set([
  "node-created",
  "lease-taken",
  "lease-renewed",
  "lease-expired",
  "session-started",
  "note-appended",
  "outbox-intent-recorded",
]);

export function upcastV1(raw: unknown): LedgerEvent | undefined {
  if (!isRecord(raw)) return undefined;
  const kind = prop(raw, "kind");
  if (typeof kind !== "string") return undefined;

  if (PASS_THROUGH_KINDS.has(kind)) return isLedgerEvent(raw) ? raw : undefined;
  // v1 never recorded debrief-filed's fields, so it is refused the same way a v1 `reset` is.
  if (kind === "debrief-filed") return undefined;

  const node = prop(raw, "node");
  if (!isNode(node)) return undefined;

  if (kind === "gate-moved") {
    const gateId = prop(raw, "gate");
    const to = prop(raw, "to");
    if (!isString(gateId) || !isV1Gate(to)) return undefined;
    return { kind: "gate-moved", node, gate: gateId, to: upcastGate(to) };
  }

  if (kind === "receipt-written") {
    const receipt = prop(raw, "receipt");
    if (!isV1Receipt(receipt)) return undefined;
    return { kind: "receipt-written", node, receipt: upcastReceipt(receipt) };
  }

  if (kind === "outcome-set") {
    const rawOutcome = prop(raw, "outcome");
    if (!isV1Outcome(rawOutcome)) return undefined;
    const upcast = upcastOutcome(rawOutcome);
    return upcast === undefined
      ? undefined
      : { kind: "outcome-set", node, outcome: upcast };
  }

  return undefined;
}
