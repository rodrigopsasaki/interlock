import { createControlledClock, ms } from "@phyxiusjs/clock";
import { describe, expect, it } from "vitest";
import { recordingNarrate } from "../src/narration.ts";
import { memoryLedgerWithLog } from "./support/memoryLedger.ts";

describe("recordingNarrate", () => {
  it("appends a session-narrated event stamped with the clock's wall time, then calls through", () => {
    const { ledger, events } = memoryLedgerWithLog();
    const clock = createControlledClock({ initialTime: 1_000 });
    const lines: string[] = [];

    const narrate = recordingNarrate(ledger, clock, "s1", (line) =>
      lines.push(line),
    );
    narrate("first");
    clock.advanceBy(ms(5));
    narrate("second");

    expect(lines).toEqual(["first", "second"]);
    const narrated = events.filter(
      (event) => event.kind === "session-narrated",
    );
    expect(narrated).toEqual([
      { kind: "session-narrated", session: "s1", at: 1_000, line: "first" },
      { kind: "session-narrated", session: "s1", at: 1_005, line: "second" },
    ]);
  });
});
