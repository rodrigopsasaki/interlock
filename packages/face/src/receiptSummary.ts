import type { Derivation, Duration, Receipt, Spend } from "ledger";

export interface ReceiptSummary {
  readonly id: string;
  readonly commit: string;
  readonly duration: Duration;
  readonly spend: Spend;
  readonly derivation: Derivation["kind"];
}

export function summarizeReceipt(receipt: Receipt): ReceiptSummary {
  return {
    id: receipt.id,
    commit: receipt.commitSha,
    duration: receipt.duration,
    spend: receipt.spend,
    derivation: receipt.derivation.kind,
  };
}
