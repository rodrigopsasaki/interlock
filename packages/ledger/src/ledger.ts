import type { Clock } from "@phyxiusjs/clock";
import { isErr, ok, type Result } from "@phyxiusjs/fp";
import { Journal } from "@phyxiusjs/journal";
import type { LedgerEvent } from "./event.ts";
import { applyEvent, type LedgerProjection } from "./projection.ts";
import { readReplay, type ReplayRefusal } from "./replay.ts";
import { attachLedgerSink } from "./sink.ts";

export interface LedgerOptions {
  readonly clock: Clock;
  readonly directory: string;
}

export interface Ledger {
  append(event: LedgerEvent): void;
  projection(): LedgerProjection;
  close(): Promise<void>;
}

export async function createLedger(
  options: LedgerOptions,
): Promise<Result<Ledger, ReplayRefusal>> {
  const replayed = await readReplay(options.directory);
  if (isErr(replayed)) return replayed;
  const journal = new Journal<LedgerEvent>({ clock: options.clock });
  let current = replayed.value;
  journal.subscribe((entry) => {
    current = applyEvent(current, entry.data);
  });
  const detach = attachLedgerSink(journal, options.directory);
  return ok({
    append(event) {
      journal.append(event);
    },
    projection() {
      return current;
    },
    async close() {
      detach();
    },
  });
}
