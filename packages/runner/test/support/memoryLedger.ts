import { ok } from "@phyxiusjs/fp";
import {
  applyEvent,
  emptyProjection,
  type Ledger,
  type LedgerEvent,
  type LedgerProjection,
} from "ledger";

export function memoryLedger(): Ledger {
  return memoryLedgerWithLog().ledger;
}

export function memoryLedgerWithLog(): {
  readonly ledger: Ledger;
  readonly events: readonly LedgerEvent[];
} {
  let projection: LedgerProjection = emptyProjection();
  const events: LedgerEvent[] = [];
  const ledger: Ledger = {
    append(event) {
      events.push(event);
      projection = applyEvent(projection, event);
    },
    appendConfirmed(event) {
      events.push(event);
      projection = applyEvent(projection, event);
      return ok(undefined);
    },
    projection() {
      return projection;
    },
    directory() {
      return "";
    },
    close() {
      return Promise.resolve();
    },
  };
  return { ledger, events };
}
