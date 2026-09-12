import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
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

function parseEvents(
  raw: string,
  table: ReadonlyMap<string, Upcaster>,
): Result<readonly LedgerEvent[], ReplayRefusal> {
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
  return ok(events);
}

export function replayFromRaw(
  raw: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): Result<LedgerProjection, ReplayRefusal> {
  const events = parseEvents(raw, table);
  return isErr(events) ? events : ok(fold(events.value));
}

async function readJournalRaw(directory: string): Promise<string | undefined> {
  try {
    return await readFile(journalPath(directory), "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export async function readReplay(
  directory: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): Promise<Result<LedgerProjection, ReplayRefusal>> {
  const raw = await readJournalRaw(directory);
  return raw === undefined ? ok(emptyProjection()) : replayFromRaw(raw, table);
}

export async function readRawEvents(
  directory: string,
  table: ReadonlyMap<string, Upcaster> = upcastTable,
): Promise<Result<readonly LedgerEvent[], ReplayRefusal>> {
  const raw = await readJournalRaw(directory);
  return raw === undefined ? ok([]) : parseEvents(raw, table);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
