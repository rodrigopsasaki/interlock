import { readFile } from "node:fs/promises";
import { err, ok, type Result } from "@phyxiusjs/fp";
import { shapeTag, type Upcaster, upcastTable } from "./envelope.ts";
import type { LedgerEvent } from "./event.ts";
import { emptyProjection, fold, type LedgerProjection } from "./projection.ts";
import { journalPath } from "./sink.ts";

export type ParsedLine =
  | { readonly kind: "event"; readonly event: LedgerEvent }
  | { readonly kind: "tail" }
  | { readonly kind: "refused"; readonly tag: string };

export interface ReplayRefusal {
  readonly tag: string;
  readonly line: number;
}

// A line that fails to parse is the tail of a write the process died mid-way
// through, never a reason to stop trusting what came before it.
export function parseLine(
  line: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): ParsedLine {
  const trimmed = line.trim();
  if (trimmed.length === 0) return { kind: "tail" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: "tail" };
  }
  const tag = shapeTag(parsed);
  if (tag === undefined) return { kind: "refused", tag: "" };
  const upcast = table.get(tag);
  const event = upcast?.(parsed);
  return event === undefined ? { kind: "refused", tag } : { kind: "event", event };
}

export function replayFromRaw(
  raw: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): Result<LedgerProjection, ReplayRefusal> {
  const events: LedgerEvent[] = [];
  const lines = raw.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const parsed = parseLine(lines[index] ?? "", table);
    if (parsed.kind === "tail") break;
    if (parsed.kind === "refused") {
      return err({ tag: parsed.tag, line: index + 1 });
    }
    events.push(parsed.event);
  }
  return ok(fold(events));
}

export async function readReplay(
  directory: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): Promise<Result<LedgerProjection, ReplayRefusal>> {
  let raw: string;
  try {
    raw = await readFile(journalPath(directory), "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return ok(emptyProjection());
    throw error;
  }
  return replayFromRaw(raw, table);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
