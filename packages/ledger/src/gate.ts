import { err, ok, type Result } from "@phyxiusjs/fp";
import { isReceipt, type Receipt } from "./receipt.ts";
import { isRecord, isString, prop } from "./validate.ts";

export type Gate =
  | { readonly kind: "pending" }
  | { readonly kind: "satisfied"; readonly receipt: Receipt }
  | {
      readonly kind: "blocked";
      readonly evidence: string;
      readonly because: string;
    }
  | {
      readonly kind: "waived";
      readonly authority: string;
      readonly because: string;
      readonly receipt: Receipt;
    }
  | {
      readonly kind: "superseded";
      readonly authority: string;
      readonly because: string;
    };

export const gate = {
  pending: (): Gate => ({ kind: "pending" }),
  satisfied: (receipt: Receipt): Gate => ({ kind: "satisfied", receipt }),
  blocked: (evidence: string, because: string): Gate => ({
    kind: "blocked",
    evidence,
    because,
  }),
  waived: (authority: string, because: string, receipt: Receipt): Gate => ({
    kind: "waived",
    authority,
    because,
    receipt,
  }),
  superseded: (authority: string, because: string): Gate => ({
    kind: "superseded",
    authority,
    because,
  }),
};

export function isGate(value: unknown): value is Gate {
  if (!isRecord(value)) return false;
  const kind = prop(value, "kind");
  if (typeof kind !== "string") return false;
  switch (kind) {
    case "pending":
      return true;
    case "satisfied":
      return isReceipt(prop(value, "receipt"));
    case "blocked":
      return isString(prop(value, "evidence")) && isString(prop(value, "because"));
    case "waived":
      return (
        isString(prop(value, "authority")) &&
        isString(prop(value, "because")) &&
        isReceipt(prop(value, "receipt"))
      );
    case "superseded":
      return isString(prop(value, "authority")) && isString(prop(value, "because"));
    default:
      return false;
  }
}

export type GateRefusal =
  | {
      readonly kind: "illegal-transition";
      readonly from: Gate["kind"];
      readonly to: Gate["kind"];
    }
  | {
      readonly kind: "undeclared-gate";
      readonly gate: string;
      readonly declared: readonly string[];
    };

export function proposeGateMove(
  declaredGates: readonly string[],
  gateId: string,
  current: Gate,
  next: Gate,
): Result<Gate, GateRefusal> {
  if (!declaredGates.includes(gateId)) {
    return err({
      kind: "undeclared-gate",
      gate: gateId,
      declared: declaredGates,
    });
  }
  if (current.kind === "waived" || current.kind === "superseded") {
    return err({
      kind: "illegal-transition",
      from: current.kind,
      to: next.kind,
    });
  }
  return ok(next);
}
