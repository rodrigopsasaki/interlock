import { isLedgerEvent, type LedgerEvent } from "../event.ts";
import { isRecord, prop } from "../validate.ts";

export function carriesPersonSaid(raw: unknown): boolean {
  return isRecord(raw) && prop(raw, "kind") === "person-said";
}

export function upcastV8(raw: unknown): LedgerEvent | undefined {
  if (carriesPersonSaid(raw)) return undefined;
  return isLedgerEvent(raw) ? raw : undefined;
}
