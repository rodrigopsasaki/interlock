import type { Discovery } from "ledger";
import type { AbsorbOutcome, ContextOutcome } from "./client.ts";
import { countDiscoveriesAgainstSlice } from "./sliceCount.ts";

export interface AbsorbSlice {
  readonly body: string;
  readonly discoveries: readonly Discovery[];
}

export function narrateContext(address: string, outcome: ContextOutcome): string {
  switch (outcome.kind) {
    case "empty":
      return `context ${address}: no substrate addressed`;
    case "rendered":
      return `context ${address}: ${outcome.items.length} item(s), vocabulary ${outcome.vocabulary}`;
    case "refused":
      return `context ${address}: refused, ${outcome.because}`;
  }
}

export function narrateAbsorb(
  address: string,
  outcome: AbsorbOutcome,
  slice?: AbsorbSlice,
): string {
  switch (outcome.kind) {
    case "empty":
      return `absorb ${address}: no substrate addressed`;
    case "refused":
      return `absorb ${address}: refused, ${outcome.because}`;
    case "acknowledged": {
      if (outcome.discoveries.length === 0 && slice !== undefined && slice.discoveries.length > 0) {
        const counted = countDiscoveriesAgainstSlice(slice.body, slice.discoveries);
        return (
          `absorb ${address}: ${outcome.decisionsAbsorbed.length} decision(s) absorbed, ` +
          `discoveries ${counted.known} known/${counted.unknown} unknown against the slice, ` +
          `${outcome.gaps.length} gap(s)`
        );
      }
      const known = outcome.discoveries.filter(
        (discovery) => discovery.placement === "known",
      ).length;
      const fresh = outcome.discoveries.filter((discovery) => discovery.placement === "new").length;
      const unplaced = outcome.discoveries.filter(
        (discovery) => discovery.placement === "unplaced",
      ).length;
      return (
        `absorb ${address}: ${outcome.decisionsAbsorbed.length} decision(s) absorbed, ` +
        `discoveries ${known} known/${fresh} new/${unplaced} unplaced, ` +
        `${outcome.gaps.length} gap(s)`
      );
    }
  }
}
