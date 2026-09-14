import { ok } from "@phyxiusjs/fp";
import {
  applyEvent,
  emptyProjection,
  type Ledger,
  type LedgerEvent,
  type LedgerProjection,
  readOutboxEvidence,
} from "ledger";

export function memoryLedger(): Ledger {
  return memoryLedgerWithLog().ledger;
}

export function memoryLedgerWithLog(directory = ""): {
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
    readOutboxEvidence(node, session, id) {
      return readOutboxEvidence(projection.outbox, directory, node, session, id);
    },
    directory() {
      return directory;
    },
    close() {
      return Promise.resolve();
    },
  };
  return { ledger, events };
}
