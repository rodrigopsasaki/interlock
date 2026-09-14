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

export interface LedgerFileOperations {
  mkdir(directory: string): void;
  open(path: string): number;
  write(descriptor: number, content: string): void;
  sync(descriptor: number): void;
  close(descriptor: number): void;
}

const nodeFileOperations: LedgerFileOperations = {
  mkdir(directory) {
    mkdirSync(directory, { recursive: true });
  },
  open(path) {
    return openSync(path, "a");
  },
  write(descriptor, content) {
    writeFileSync(descriptor, content);
  },
  sync(descriptor) {
    fsyncSync(descriptor);
  },
  close(descriptor) {
    closeSync(descriptor);
  },
};

export function createLedgerSink(
  directory: string,
  operations: LedgerFileOperations = nodeFileOperations,
): LedgerSink {
  operations.mkdir(directory);
  const path = journalPath(directory);
  return {
    append(entry) {
      const descriptor = operations.open(path);
      try {
        operations.write(descriptor, `${JSON.stringify(envelopeFor(entry.data))}\n`);
        operations.sync(descriptor);
      } finally {
        operations.close(descriptor);
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
