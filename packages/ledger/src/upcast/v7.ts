import { isLedgerEvent, type LedgerEvent } from "../event.ts";
import { isRecord, prop } from "../validate.ts";

export function carriesQuestionNote(raw: unknown): boolean {
  if (!isRecord(raw) || prop(raw, "kind") !== "note-appended") return false;
  const embedded = prop(raw, "note");
  return isRecord(embedded) && prop(embedded, "kind") === "question";
}

export function upcastV7(raw: unknown): LedgerEvent | undefined {
  if (carriesQuestionNote(raw)) return undefined;
  return isLedgerEvent(raw) ? raw : undefined;
}
