import { type LedgerEvent, upcastPreV5Event } from "../event.ts";

export function upcastV3(raw: unknown): LedgerEvent | undefined {
  return upcastPreV5Event(raw);
}
