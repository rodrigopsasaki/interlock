import type { Outcome } from "ledger";

export type NodeWeight =
  | { readonly kind: "measured"; readonly ms: number }
  | { readonly kind: "unknown"; readonly because: string };

export function nodeWeight(
  id: string,
  outcome: Outcome | undefined,
): NodeWeight {
  if (outcome === undefined) {
    return { kind: "unknown", because: `${id}: no outcome yet` };
  }
  const measuredMs = outcome.receipts
    .map((receipt) => receipt.duration)
    .filter((value) => value.kind === "measured")
    .map((value) => value.ms);
  return measuredMs.length === 0
    ? {
        kind: "unknown",
        because: `${id}: no receipt in its outcome carries a measured duration`,
      }
    : { kind: "measured", ms: measuredMs.reduce((sum, ms) => sum + ms, 0) };
}
