import { err, ok, type Result } from "@phyxiusjs/fp";
import { isDisposition, type Disposition } from "./disposition.ts";
import type { Gate } from "./gate.ts";
import { isReceipt, type Receipt } from "./receipt.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type Outcome =
  | { readonly kind: "cleared"; readonly receipts: readonly Receipt[] }
  | {
      readonly kind: "held";
      readonly receipts: readonly Receipt[];
      readonly failure: string;
      readonly disposition: Disposition;
      readonly because: string;
      readonly expiry: number;
    }
  | { readonly kind: "reset"; readonly receipts: readonly Receipt[] }
  | {
      readonly kind: "failed";
      readonly receipts: readonly Receipt[];
      readonly failure: string;
      readonly disposition: Disposition;
      readonly because: string;
    }
  | {
      readonly kind: "cancelled";
      readonly receipts: readonly Receipt[];
      readonly authority: string;
      readonly because: string;
    }
  | {
      readonly kind: "superseded";
      readonly receipts: readonly Receipt[];
      readonly authority: string;
      readonly because: string;
    };

export interface ClearRefusal {
  readonly kind: "gate-not-cleared";
  readonly missing: readonly string[];
}

export function buildCleared(
  declaredGates: readonly string[],
  gates: ReadonlyMap<string, Gate>,
): Result<Outcome, ClearRefusal> {
  const receipts: Receipt[] = [];
  const missing: string[] = [];
  for (const id of declaredGates) {
    const found = gates.get(id);
    if (found?.kind === "satisfied" || found?.kind === "waived") {
      receipts.push(found.receipt);
    } else {
      missing.push(id);
    }
  }
  return missing.length > 0
    ? err({ kind: "gate-not-cleared", missing })
    : ok({ kind: "cleared", receipts });
}

export const outcome = {
  reset: (receipts: readonly Receipt[]): Outcome => ({
    kind: "reset",
    receipts,
  }),
  held: (
    receipts: readonly Receipt[],
    failure: string,
    disposition: Disposition,
    because: string,
    expiry: number,
  ): Outcome => ({
    kind: "held",
    receipts,
    failure,
    disposition,
    because,
    expiry,
  }),
  failed: (
    receipts: readonly Receipt[],
    failure: string,
    disposition: Disposition,
    because: string,
  ): Outcome => ({
    kind: "failed",
    receipts,
    failure,
    disposition,
    because,
  }),
  cancelled: (
    receipts: readonly Receipt[],
    authority: string,
    because: string,
  ): Outcome => ({
    kind: "cancelled",
    receipts,
    authority,
    because,
  }),
  superseded: (
    receipts: readonly Receipt[],
    authority: string,
    because: string,
  ): Outcome => ({
    kind: "superseded",
    receipts,
    authority,
    because,
  }),
};

function isReceiptArray(value: unknown): value is readonly Receipt[] {
  return Array.isArray(value) && value.every(isReceipt);
}

export function isOutcome(value: unknown): value is Outcome {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  const receipts = prop(value, "receipts");
  if (typeof kind !== "string" || !isReceiptArray(receipts)) return false;
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
