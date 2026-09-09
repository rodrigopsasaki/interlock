import { describe, expect, it } from "vitest";
import { createControlledClock, ms } from "@phyxiusjs/clock";
import { Journal } from "@phyxiusjs/journal";
import { compositeSink, createDrain } from "@phyxiusjs/drain";

interface ProbeEvent {
  readonly kind: "probe";
}

describe("journal ordered by the injected clock", () => {
  it("stamps sequence and wall time from the clock, not append order alone", () => {
    const clock = createControlledClock({ initialTime: 0 });
    const journal = new Journal<ProbeEvent>({ clock });

    journal.append({ kind: "probe" });
    clock.advanceBy(ms(10));
    journal.append({ kind: "probe" });

    const [first, second] = journal.getSnapshot().entries;
    expect(first?.sequence).toBe(0);
    expect(second?.sequence).toBe(1);
    expect(second?.timestamp.wallMs).toBe(10);
  });
});

describe("durability composes on top of the journal", () => {
  it("drains without a domain sink, proving the journal-to-sink seam resolves", async () => {
    const clock = createControlledClock({ initialTime: 0 });
    const journal = new Journal<ProbeEvent>({ clock });
    const drain = createDrain<ProbeEvent>({
      journal,
      clock,
      sink: compositeSink<ProbeEvent>([]),
    });

    journal.append({ kind: "probe" });
    await drain.stop();

    expect(journal.size()).toBe(1);
  });
});
