import { describe, expect, it } from "vitest";
import { createControlledClock, ms } from "@phyxiusjs/clock";
import { Journal } from "@phyxiusjs/journal";

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
