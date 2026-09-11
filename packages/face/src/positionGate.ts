import type { Gate } from "ledger";
import { summarizeReceipt, type ReceiptSummary } from "./receiptSummary.ts";

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
  readonly state: PositionGateState;
  readonly receipt?: ReceiptSummary;
}

export function positionGate(id: string, current: Gate): PositionGate {
  switch (current.kind) {
    case "pending":
      return { id, state: { kind: "pending" } };
    case "satisfied":
      return {
        id,
        state: { kind: "satisfied" },
        receipt: summarizeReceipt(current.receipt),
      };
    case "blocked":
      return {
        id,
        state: {
          kind: "blocked",
          evidence: current.evidence,
          because: current.because,
        },
      };
    case "waived":
      return {
        id,
        state: {
          kind: "waived",
          authority: current.authority,
          because: current.because,
        },
        receipt: summarizeReceipt(current.receipt),
      };
    case "superseded":
      return {
        id,
        state: {
          kind: "superseded",
          authority: current.authority,
          because: current.because,
        },
      };
  }
}
