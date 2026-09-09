import type { Clock } from "@phyxiusjs/clock";
import { Journal } from "@phyxiusjs/journal";
import type { LedgerEvent } from "./event.js";
import {
  applyEvent,
  emptyProjection,
  type LedgerProjection,
} from "./projection.js";
import { createLedgerDrain } from "./sink.js";

export interface LedgerOptions {
  readonly clock: Clock;
  readonly directory: string;
}

export interface Ledger {
  append(event: LedgerEvent): void;
  projection(): LedgerProjection;
  close(): Promise<void>;
}

// A library, not a service: opens a journal over the injected clock, drains
// it to the configured directory, and keeps a projection folded live from
// the same events every reader could fold for themselves from the sink.
export function createLedger(options: LedgerOptions): Ledger {
  const journal = new Journal<LedgerEvent>({ clock: options.clock });
  const drain = createLedgerDrain(journal, options.clock, options.directory);
  let current = emptyProjection();
  journal.subscribe((entry) => {
    current = applyEvent(current, entry.data);
  });
  return {
    append(event) {
      journal.append(event);
    },
    projection() {
      return current;
    },
    async close() {
      await drain.flush();
      await drain.stop();
    },
  };
}
