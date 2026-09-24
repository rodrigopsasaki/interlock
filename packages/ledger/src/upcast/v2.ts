import { type LedgerEvent, upcastPreV5Event } from "../event.ts";

export function upcastV2(raw: unknown): LedgerEvent | undefined {
  return upcastPreV5Event(raw);
}
