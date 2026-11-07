import type { ProviderHeadroom } from "ledger";

export function readKimiHeadroom(): ProviderHeadroom {
  return {
    state: "unknown",
    reason:
      "the CLI's provider list and local session state expose no allowance or current rate-limit report",
  };
}
