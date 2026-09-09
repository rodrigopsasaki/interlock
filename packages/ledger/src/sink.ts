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

// The default batch size is kept: drain@0.3.0's stop() does not await an
// in-flight write, and a run under the threshold never starts one to lose.
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
