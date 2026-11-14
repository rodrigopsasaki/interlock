import { heldOn, outcome } from "ledger";
import { describe, expect, it } from "vitest";
import { renderOutcome } from "../src/sessionColumns.ts";

describe("busy hold", () => {
  it("names the retry disposition on a held line", () => {
    expect(
      renderOutcome(
        outcome.held(
          [],
          heldOn.gateFailure("typecheck", "retry"),
          "machine busy after 4 attempts: lock unavailable",
          0,
        ),
      ),
    ).toBe(
      "  held (retry): machine busy after 4 attempts: lock unavailable (revisit 1970-01-01T00:00:00.000Z)",
    );
  });
});
