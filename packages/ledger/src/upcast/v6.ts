import { isLedgerEvent, type LedgerEvent, upcastSessionStarted } from "../event.ts";
import { isRecord, prop } from "../validate.ts";

export function upcastV6(raw: unknown): LedgerEvent | undefined {
  if (!isRecord(raw) || prop(raw, "kind") === "session-facts-observed") return undefined;
  if (prop(raw, "kind") === "session-started") return upcastSessionStarted(raw);
  return isLedgerEvent(raw) ? raw : undefined;
}
