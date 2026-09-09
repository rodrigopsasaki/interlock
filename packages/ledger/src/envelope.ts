import { isLedgerEvent, type LedgerEvent } from "./event.js";
import { isRecord, isString, prop } from "./validate.js";

export const EVENT_SHAPE = "event@v1";

export type EventEnvelope = {
  readonly interlock: typeof EVENT_SHAPE;
} & LedgerEvent;

export function envelopeFor(event: LedgerEvent): EventEnvelope {
  return { interlock: EVENT_SHAPE, ...event };
}

export function shapeTag(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const tag = prop(value, "interlock");
  return isString(tag) ? tag : undefined;
}

export type Upcaster = (raw: unknown) => LedgerEvent | undefined;

export const upcastTable: ReadonlyMap<string, Upcaster> = new Map([
  [EVENT_SHAPE, (raw: unknown) => (isLedgerEvent(raw) ? raw : undefined)],
]);
