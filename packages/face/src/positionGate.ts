import type { Gate } from "ledger";
import { type ReceiptSummary, summarizeReceipt } from "./receiptSummary.ts";

export type PositionGateState =
  | { readonly kind: "pending" }
  | { readonly kind: "satisfied" }
  | {
      readonly kind: "blocked";
      readonly evidence: string;
      readonly because: string;
    }
  | {
      readonly kind: "waived";
      readonly authority: string;
      readonly because: string;
    }
  | {
      readonly kind: "superseded";
      readonly authority: string;
      readonly because: string;
    };

export interface PositionGate {
  readonly id: string;
  readonly kind: string;
  readonly state: PositionGateState;
  readonly receipt?: ReceiptSummary;
}

export function positionGate(id: string, kind: string, current: Gate): PositionGate {
  return { id, kind, ...gateFacts(current) };
}

function gateFacts(current: Gate): Omit<PositionGate, "id" | "kind"> {
  switch (current.kind) {
    case "pending":
      return { state: { kind: "pending" } };
    case "satisfied":
      return {
        state: { kind: "satisfied" },
        receipt: summarizeReceipt(current.receipt),
      };
    case "blocked":
      return {
        state: {
          kind: "blocked",
          evidence: current.evidence,
          because: current.because,
        },
      };
    case "waived":
      return {
        state: {
          kind: "waived",
          authority: current.authority,
          because: current.because,
        },
        receipt: summarizeReceipt(current.receipt),
      };
    case "superseded":
      return {
        state: {
          kind: "superseded",
          authority: current.authority,
          because: current.because,
        },
      };
  }
}
