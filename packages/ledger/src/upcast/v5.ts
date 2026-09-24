import { isLedgerEvent, type LedgerEvent, upcastSessionStarted } from "../event.ts";
import { isRecord, prop } from "../validate.ts";

export function upcastV5(raw: unknown): LedgerEvent | undefined {
  if (!isRecord(raw)) return undefined;
  if (prop(raw, "kind") === "session-started") return upcastSessionStarted(raw);
  return isLedgerEvent(raw) ? raw : undefined;
}
