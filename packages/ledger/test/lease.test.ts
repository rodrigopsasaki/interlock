import { describe, expect, it } from "vitest";
import { createLease, isLease, renewLease } from "../src/lease.js";

const node = { graph: "0001-bootstrap", id: "ledger" };

describe("lease", () => {
  it("carries a typed expiry", () => {
    const lease = createLease(node, "session-1", 30_000);
    expect(isLease(lease)).toBe(true);
    expect(lease.expiry).toBe(30_000);
  });

  it("renews forward", () => {
    const lease = createLease(node, "session-1", 30_000);
    const renewed = renewLease(lease, 40_000);
    expect(renewed).toEqual({
      _tag: "Ok",
      value: { ...lease, expiry: 40_000 },
    });
  });
});
