import { readFile } from "node:fs/promises";
import { isLedgerEvent, type LedgerEvent } from "./event.js";
import { emptyProjection, fold, type LedgerProjection } from "./projection.js";
import { journalPath } from "./sink.js";

// One JSON line per event. A line that fails to parse is the tail of a
// write the process died in the middle of, never a reason to stop trusting
// everything that came before it.
export function parseLine(line: string): LedgerEvent | undefined {
  const trimmed = line.trim();
  if (trimmed.length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  return isLedgerEvent(parsed) ? parsed : undefined;
}

// The crash-only guarantee: replay a prefix of the sink to the same
// projection as replaying the whole thing up to the last complete line.
// A partial line at the end — the write a kill interrupted — is dropped,
// never guessed at.
export function replayFromRaw(raw: string): LedgerProjection {
  const events: LedgerEvent[] = [];
  for (const line of raw.split("\n")) {
    const event = parseLine(line);
    if (event === undefined) break;
    events.push(event);
  }
  return fold(events);
}

export async function readReplay(directory: string): Promise<LedgerProjection> {
  let raw: string;
  try {
    raw = await readFile(journalPath(directory), "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return emptyProjection();
    throw error;
  }
  return replayFromRaw(raw);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
