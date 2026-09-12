import type { AbsorbOutcome, ContextOutcome } from "./client.ts";

// Every call is one narrated line: verb, address, outcome.

export function narrateContext(
  address: string,
  outcome: ContextOutcome,
): string {
  switch (outcome.kind) {
    case "empty":
      return `context ${address}: no substrate addressed`;
    case "rendered":
      return `context ${address}: ${outcome.items.length} item(s), vocabulary ${outcome.vocabulary}`;
    case "refused":
      return `context ${address}: refused, ${outcome.because}`;
  }
}

export function narrateAbsorb(address: string, outcome: AbsorbOutcome): string {
  switch (outcome.kind) {
    case "empty":
      return `absorb ${address}: no substrate addressed`;
    case "refused":
      return `absorb ${address}: refused, ${outcome.because}`;
    case "acknowledged": {
      const known = outcome.discoveries.filter(
        (discovery) => discovery.placement === "known",
      ).length;
      const fresh = outcome.discoveries.filter(
        (discovery) => discovery.placement === "new",
      ).length;
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
