export { isValidSubstrateAddress, substrateClientFor } from "./address.ts";
export type {
  AbsorbOutcome,
  ContextOutcome,
  DiscoveryPlacement,
  EvidenceForAbsorb,
  SubstrateClient,
} from "./client.ts";
export {
  debriefDerivationString,
  derivationString,
} from "./derivationString.ts";
export { discoveryItemKind } from "./discoveryKind.ts";
export type {
  DecisionEvidence,
  DiscoveryEvidence,
  EvidenceSession,
} from "./evidence.ts";
export { evidenceOf } from "./evidence.ts";
export { narrateAbsorb, narrateContext } from "./narrate.ts";
export { noneClient } from "./noneClient.ts";

export type {
  WireDebrief,
  WireDecision,
  WireDiscovery,
  WireGateRun,
  WireNotes,
} from "./wire.ts";
export { toWireDebrief, toWireNotes } from "./wire.ts";
