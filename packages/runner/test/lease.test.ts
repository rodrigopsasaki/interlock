import { createControlledClock, ms } from "@phyxiusjs/clock";
import type { LedgerEvent, Node } from "ledger";
import { describe, expect, it } from "vitest";
import { takeLease } from "../src/lease.ts";

function fakeLedger(): {
  append: (event: LedgerEvent) => void;
  events: LedgerEvent[];
} {
  const events: LedgerEvent[] = [];
  return { append: (event) => events.push(event), events };
}

const node: Node = { graph: "0001-bootstrap", id: "runner-command-gate" };

describe("lease and heartbeat", () => {
  it("takes a lease with a typed expiry on the clock's current time", () => {
    const clock = createControlledClock({ initialTime: 1_000 });
    const ledger = fakeLedger();

    takeLease(ledger, clock, node, "session-1", 900_000);

    expect(ledger.events).toEqual([
      { kind: "lease-taken", node, session: "session-1", expiry: 901_000 },
    ]);
  });

  it("renews by heartbeat at a third of the lease length", () => {
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = fakeLedger();

    takeLease(ledger, clock, node, "session-1", 900_000);
    clock.advanceBy(ms(300_000));
    clock.advanceBy(ms(300_000));

    expect(ledger.events).toEqual([
      { kind: "lease-taken", node, session: "session-1", expiry: 900_000 },
      { kind: "lease-renewed", node, session: "session-1", expiry: 1_200_000 },
      { kind: "lease-renewed", node, session: "session-1", expiry: 1_500_000 },
    ]);
  });

  it("stops renewing once stopped", () => {
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = fakeLedger();

    const lease = takeLease(ledger, clock, node, "session-1", 900_000);
    clock.advanceBy(ms(300_000));
    lease.stop();
    clock.advanceBy(ms(300_000));
    clock.advanceBy(ms(300_000));

    expect(ledger.events).toEqual([
      { kind: "lease-taken", node, session: "session-1", expiry: 900_000 },
      { kind: "lease-renewed", node, session: "session-1", expiry: 1_200_000 },
    ]);
  });
});
