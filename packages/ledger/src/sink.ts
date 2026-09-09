import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Clock } from "@phyxiusjs/clock";
import { createDrain, fileSink, type Drain } from "@phyxiusjs/drain";
import type { Journal } from "@phyxiusjs/journal";
import type { LedgerEvent } from "./event.js";

export const JOURNAL_FILE_NAME = "journal.jsonl";

export function journalPath(directory: string): string {
  return join(directory, JOURNAL_FILE_NAME);
}

// `@phyxiusjs/drain`'s own `fileSink` has no mkdir of its own; this is the
// adapter that gives it a directory to write into. The default batch size is
// kept deliberately: published drain@0.3.0's `stop()` does not await a write
// already in flight, so a small run that never crosses the batch threshold
// before `close()` never has one in flight to lose (see notes.yaml).
export function createLedgerDrain(
  journal: Journal<LedgerEvent>,
  clock: Clock,
  directory: string,
): Drain {
  mkdirSync(directory, { recursive: true });
  return createDrain<LedgerEvent>({
    journal,
    clock,
    sink: fileSink<LedgerEvent>({ path: journalPath(directory) }),
  });
}
