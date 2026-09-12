import type { Item } from "debrief";
import type { Debrief, Gap, Node, Note, Receipt } from "ledger";

export type ContextOutcome =
  | { readonly kind: "empty" }
  | {
      readonly kind: "rendered";
      readonly items: readonly Item[];
      readonly vocabulary: string;
    }
  | { readonly kind: "refused"; readonly because: string };

export interface DiscoveryPlacement {
  readonly id: string;
  readonly placement: "known" | "new" | "unplaced";
}

export type AbsorbOutcome =
  | { readonly kind: "empty" }
  | {
      readonly kind: "acknowledged";
      readonly decisionsAbsorbed: readonly string[];
      readonly discoveries: readonly DiscoveryPlacement[];
      readonly gaps: readonly Gap[];
    }
  | { readonly kind: "refused"; readonly because: string };

export interface SubstrateClient {
  readonly address: string;
  context(node: Node, scope: readonly string[], role: string): Promise<ContextOutcome>;
  absorb(
    node: Node,
    debrief: Debrief,
    notes: readonly Note[],
    receipts: readonly Receipt[],
  ): Promise<AbsorbOutcome>;
  capabilities(): Promise<readonly string[]>;
}
