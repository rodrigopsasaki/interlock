import type { Clock } from "@phyxiusjs/clock";
import { Journal } from "@phyxiusjs/journal";
import type { LedgerEvent } from "./event.js";
import { applyEvent, type LedgerProjection } from "./projection.js";
import { readReplay } from "./replay.js";
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

// Crash-only: a second call over the same directory continues the prior run
// instead of starting from empty.
export async function createLedger(options: LedgerOptions): Promise<Ledger> {
  const journal = new Journal<LedgerEvent>({ clock: options.clock });
  const drain = createLedgerDrain(journal, options.clock, options.directory);
  let current = await readReplay(options.directory);
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
