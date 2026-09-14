import type { Debrief, Node, Note, Receipt } from "ledger";
import type {
  AbsorbOutcome,
  ContextOutcome,
  EvidenceForAbsorb,
  SubstrateClient,
} from "./client.ts";

export function refusalClient(address: string, because: string): SubstrateClient {
  const context = async (
    _node: Node,
    _scope: readonly string[],
    _role: string,
  ): Promise<ContextOutcome> => ({ kind: "refused", because });
  const absorb = async (
    _node: Node,
    _debrief: Debrief,
    _notes: readonly Note[],
    _receipts: readonly Receipt[],
    _evidence?: EvidenceForAbsorb,
  ): Promise<AbsorbOutcome> => ({ kind: "refused", because });
  const capabilities = async (): Promise<readonly string[]> => [];
  return { address, context, absorb, capabilities };
}
