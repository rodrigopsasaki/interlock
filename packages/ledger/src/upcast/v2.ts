import { isLedgerEvent, type LedgerEvent } from "../event.ts";

export function upcastV2(raw: unknown): LedgerEvent | undefined {
  return isLedgerEvent(raw) ? raw : undefined;
}
