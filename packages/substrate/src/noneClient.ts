import type { SubstrateClient } from "./client.ts";

export function noneClient(): SubstrateClient {
  return {
    address: "none",
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    capabilities: () => Promise.resolve([]),
  };
}
