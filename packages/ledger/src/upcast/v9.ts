import { isLedgerEvent, type LedgerEvent } from "../event.ts";
import { isRecord, prop } from "../validate.ts";

export function carriesProviderAttribution(raw: unknown): boolean {
  if (!isRecord(raw) || prop(raw, "kind") !== "session-started") return false;
  const session = prop(raw, "session");
  if (!isRecord(session)) return false;
  const runtime = prop(session, "runtime");
  if (!isRecord(runtime)) return false;
  return prop(runtime, "provider") !== undefined || prop(runtime, "chosenBy") !== undefined;
}

export function upcastV9(raw: unknown): LedgerEvent | undefined {
  if (carriesProviderAttribution(raw)) return undefined;
  return isLedgerEvent(raw) ? raw : undefined;
}
