import type { Discovery, Gap } from "ledger";
import type { AbsorbOutcome, ContextOutcome } from "./client.ts";
import { countDiscoveriesAgainstSlice } from "./sliceCount.ts";

export type AbsorbNarration = {
  readonly translation:
    | { readonly kind: "unavailable" }
    | {
        readonly kind: "observed";
        readonly itemCount: number;
        readonly gaps: readonly Gap[];
      };
  readonly slice:
    | { readonly kind: "unavailable" }
    | {
        readonly kind: "present";
        readonly body: string;
        readonly discoveries: readonly Discovery[];
      };
};

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
  narration?: AbsorbNarration,
): string {
  switch (outcome.kind) {
    case "empty":
      return `absorb ${address}: no substrate addressed`;
    case "refused":
      return `absorb ${address}: refused, ${outcome.because}`;
    case "acknowledged": {
      const known = outcome.discoveries.filter(
        (discovery) => discovery.placement === "known",
      ).length;
      const fresh = outcome.discoveries.filter((discovery) => discovery.placement === "new").length;
      const unplaced = outcome.discoveries.filter(
        (discovery) => discovery.placement === "unplaced",
      ).length;
      const translation =
        narration?.translation.kind === "observed"
          ? `translated request supplied: ${narration.translation.itemCount} item(s), ${narration.translation.gaps.length} gap(s)`
          : "translated request supplied: unavailable";
      const slice = narration?.slice;
      const comparison =
        slice?.kind === "present"
          ? (() => {
              const counted = countDiscoveriesAgainstSlice(slice.body, slice.discoveries);
              return `textual Context slice reference comparison: ${counted.known} matching/${counted.unknown} not matching`;
            })()
          : "textual Context slice reference comparison: unavailable";
      return (
        `absorb ${address}: ${translation}; receiver response: ` +
        `${outcome.decisionsAbsorbed.length} decision ID(s), discoveries ${known} known/${fresh} new/${unplaced} unplaced, ` +
        `${outcome.gaps.length} gap(s); ${comparison}`
      );
    }
  }
}
