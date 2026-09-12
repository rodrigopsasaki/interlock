import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Journal, Unsubscribe } from "@phyxiusjs/journal";
import { envelopeFor } from "./envelope.ts";
import type { LedgerEvent } from "./event.ts";

export const JOURNAL_FILE_NAME = "journal.jsonl";

export function journalPath(directory: string): string {
  return join(directory, JOURNAL_FILE_NAME);
}

export function attachLedgerSink(journal: Journal<LedgerEvent>, directory: string): Unsubscribe {
  mkdirSync(directory, { recursive: true });
  const path = journalPath(directory);
  return journal.subscribe((entry) => {
    appendFileSync(path, `${JSON.stringify(envelopeFor(entry.data))}\n`);
  });
}
