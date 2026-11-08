import { isLedgerEvent, type LedgerEvent, upcastPreV5Event } from "./event.ts";
import { upcastV1 } from "./upcast/v1.ts";
import { upcastV2 } from "./upcast/v2.ts";
import { upcastV3 } from "./upcast/v3.ts";
import { upcastV5 } from "./upcast/v5.ts";
import { upcastV6 } from "./upcast/v6.ts";
import { carriesQuestionNote, upcastV7 } from "./upcast/v7.ts";
import { carriesPersonSaid, upcastV8 } from "./upcast/v8.ts";
import { carriesProviderAttribution, upcastV9 } from "./upcast/v9.ts";
import { isRecord, isString, prop } from "./validate.ts";

export const EVENT_SHAPE = "event@v11";

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

function predatesPersonSaid(upcast: Upcaster): Upcaster {
  return (raw: unknown) => (carriesPersonSaid(raw) ? undefined : upcast(raw));
}

function predatesQuestionNotes(upcast: Upcaster): Upcaster {
  return predatesPersonSaid((raw: unknown) => (carriesQuestionNote(raw) ? undefined : upcast(raw)));
}

const priorUpcasts: ReadonlyMap<string, Upcaster> = new Map([
  [EVENT_SHAPE, (raw: unknown) => (isLedgerEvent(raw) ? raw : undefined)],
  ["event@v10", (raw: unknown) => (isLedgerEvent(raw) ? raw : undefined)],
  ["event@v9", upcastV9],
  ["event@v8", upcastV8],
  ["event@v7", predatesPersonSaid(upcastV7)],
  ["event@v6", predatesQuestionNotes(upcastV6)],
  ["event@v5", predatesQuestionNotes(upcastV5)],
  ["event@v4", predatesQuestionNotes(upcastPreV5Event)],
  ["event@v3", predatesQuestionNotes(upcastV3)],
  ["event@v2", predatesQuestionNotes(upcastV2)],
  ["event@v1", predatesQuestionNotes(upcastV1)],
]);

export const upcastTable: ReadonlyMap<string, Upcaster> = new Map(
  [...priorUpcasts].map(([tag, upcast]) => [
    tag,
    (raw: unknown) =>
      tag !== EVENT_SHAPE &&
      ((tag !== "event@v10" && carriesProviderAttribution(raw)) ||
        (isRecord(raw) && prop(raw, "kind") === "probe"))
        ? undefined
        : upcast(raw),
  ]),
);
