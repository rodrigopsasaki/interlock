import { isLedgerEvent, type LedgerEvent } from "../event.ts";

// event@v2 declared every shape event@v3 declares except HeldOn's `uncommitted-work` arm, which
// no v2 line can carry. v3 is a superset, so today's guard already accepts every honest v2 line.
export function upcastV2(raw: unknown): LedgerEvent | undefined {
  return isLedgerEvent(raw) ? raw : undefined;
}
