import type { ProviderHeadroom } from "ledger";

export function readClaudeHeadroom(): ProviderHeadroom {
  return {
    state: "unknown",
    reason:
      "the CLI exposes allowance through interactive /usage only; stats-cache.json reports lifetime usage without an allowance",
  };
}
