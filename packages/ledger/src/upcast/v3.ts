import { isLedgerEventV4, type LedgerEvent } from "../event.ts";

export function upcastV3(raw: unknown): LedgerEvent | undefined {
  return isLedgerEventV4(raw) ? raw : undefined;
}
