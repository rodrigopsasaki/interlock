import { closeSync, fsyncSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Journal, JournalEntry, Unsubscribe } from "@phyxiusjs/journal";
import { envelopeFor } from "./envelope.ts";
import type { LedgerEvent } from "./event.ts";

export const JOURNAL_FILE_NAME = "journal.jsonl";

export function journalPath(directory: string): string {
  return join(directory, JOURNAL_FILE_NAME);
}

export interface LedgerSink {
  append(entry: JournalEntry<LedgerEvent>): void;
  close(): void;
}

export function createLedgerSink(directory: string): LedgerSink {
  mkdirSync(directory, { recursive: true });
  const path = journalPath(directory);
  return {
    append(entry) {
      const descriptor = openSync(path, "a");
      try {
        writeFileSync(descriptor, `${JSON.stringify(envelopeFor(entry.data))}\n`);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    },
    close() {},
  };
}

export function attachLedgerSink(journal: Journal<LedgerEvent>, directory: string): Unsubscribe {
  const sink = createLedgerSink(directory);
  return journal.subscribe((entry) => {
    sink.append(entry);
  });
}
