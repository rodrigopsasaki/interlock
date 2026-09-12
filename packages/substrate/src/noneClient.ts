import type { SubstrateClient } from "./client.ts";

// The address is none: renders nothing, absorbs nothing, declares no capabilities. Every call
// still resolves, so a caller that always calls context and absorb never special-cases this
// address.
export function noneClient(): SubstrateClient {
  return {
    address: "none",
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: () => Promise.resolve({ kind: "empty" }),
    capabilities: () => Promise.resolve([]),
  };
}
