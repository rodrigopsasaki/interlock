export type {
  AbsorbOutcome,
  ContextOutcome,
  DiscoveryPlacement,
  SubstrateClient,
} from "./client.ts";

export { isValidSubstrateAddress, substrateClientFor } from "./address.ts";
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
