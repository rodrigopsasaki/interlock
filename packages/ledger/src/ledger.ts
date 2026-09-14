import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { Journal } from "@phyxiusjs/journal";
import type { LedgerEvent } from "./event.ts";
import type { Node } from "./graph.ts";
import { type OutboxEvidence, readOutboxEvidence } from "./outbox.ts";
import { applyEvent, type LedgerProjection } from "./projection.ts";
import { type ReplayRefusal, readReplay } from "./replay.ts";
import { createLedgerSink, type LedgerSink } from "./sink.ts";

export interface LedgerOptions {
  readonly clock: Clock;
  readonly directory: string;
  readonly sink?: LedgerSink;
}

export interface LedgerAppendRefusal {
  readonly because: string;
}

export interface Ledger {
  append(event: LedgerEvent): void;
  appendConfirmed(event: LedgerEvent): Result<void, LedgerAppendRefusal>;
  projection(): LedgerProjection;
  readOutboxEvidence(node: Node, session: string, id: string): OutboxEvidence;
  directory(): string;
  close(): Promise<void>;
}

export async function createLedger(options: LedgerOptions): Promise<Result<Ledger, ReplayRefusal>> {
  const replayed = await readReplay(options.directory);
  if (isErr(replayed)) return replayed;
  const journal = new Journal<LedgerEvent>({ clock: options.clock });
  let current = replayed.value;
  let failure: LedgerAppendRefusal | undefined;
  const confirmed = new Set<string>();
  const sink = options.sink ?? createLedgerSink(options.directory);
  journal.subscribe((entry) => {
    if (failure !== undefined) return;
    try {
      sink.append(entry);
      confirmed.add(entry.id);
    } catch (error) {
      failure = { because: error instanceof Error ? error.message : "ledger persistence failed" };
    }
  });
  journal.subscribe((entry) => {
    if (confirmed.has(entry.id)) current = applyEvent(current, entry.data);
  });
  function appendConfirmed(event: LedgerEvent): Result<void, LedgerAppendRefusal> {
    if (failure !== undefined) return err(failure);
    const entry = journal.append(event);
    return confirmed.has(entry.id)
      ? ok(undefined)
      : err(failure ?? { because: "ledger persistence did not confirm append" });
  }
  return ok({
    append(event) {
      const appended = appendConfirmed(event);
      if (isErr(appended)) throw new Error(appended.error.because);
    },
    appendConfirmed,
    projection() {
      return current;
    },
    readOutboxEvidence(node, session, id) {
      return readOutboxEvidence(current.outbox, options.directory, node, session, id);
    },
    directory() {
      return options.directory;
    },
    async close() {
      sink.close();
    },
  });
}
