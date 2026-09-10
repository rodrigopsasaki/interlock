import {
  applyEvent,
  emptyProjection,
  type Ledger,
  type LedgerProjection,
} from "ledger";

export function memoryLedger(): Ledger {
  let projection: LedgerProjection = emptyProjection();
  return {
    append(event) {
      projection = applyEvent(projection, event);
    },
    projection() {
      return projection;
    },
    close() {
      return Promise.resolve();
    },
  };
}
