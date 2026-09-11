import { isLedgerEvent, type LedgerEvent } from "./event.ts";
import { upcastV1 } from "./upcast/v1.ts";
import { upcastV2 } from "./upcast/v2.ts";
import { upcastV3 } from "./upcast/v3.ts";
import { isRecord, isString, prop } from "./validate.ts";

export const EVENT_SHAPE = "event@v4";

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
  ["event@v3", upcastV3],
  ["event@v2", upcastV2],
  ["event@v1", upcastV1],
]);
