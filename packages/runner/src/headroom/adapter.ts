import type { ProviderHeadroom } from "ledger";
import { readClaudeHeadroom } from "../claude/headroom.ts";
import { readCodexHeadroom } from "../codex/headroom.ts";
import { readKimiHeadroom } from "../kimi/headroom.ts";

export async function readProviderHeadroom(kind: string): Promise<ProviderHeadroom> {
  switch (kind) {
    case "codex":
      return readCodexHeadroom();
    case "claude":
      return readClaudeHeadroom();
    case "kimi":
      return readKimiHeadroom();
    default:
      return { state: "unknown", reason: `no local allowance adapter for runtime kind "${kind}"` };
  }
}
