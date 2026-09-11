import { isLedgerEvent, type LedgerEvent } from "../event.ts";

export function upcastV3(raw: unknown): LedgerEvent | undefined {
  return isLedgerEvent(raw) ? raw : undefined;
}
