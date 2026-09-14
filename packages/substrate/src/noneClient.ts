import type { PreparedAbsorb, SubstrateClient } from "./client.ts";

export function noneClient(): SubstrateClient {
  const prepareAbsorb = (): Promise<PreparedAbsorb> => Promise.resolve({ kind: "none" });
  return {
    address: "none",
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    prepareAbsorb,
    capabilities: () => Promise.resolve([]),
  };
}
