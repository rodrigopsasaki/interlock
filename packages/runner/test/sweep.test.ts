import { outcome } from "ledger";
import { describe, expect, it } from "vitest";
import { ABANDONED_AUTHORITY, sweepExpiredLeases } from "../src/sweep.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const node = (id: string) => ({ graph: "0001-bootstrap", id });

describe("sweeper", () => {
  it("abandons a session whose lease expired with no outcome, never a live or already-resolved one", () => {
    const ledger = memoryLedger();

    ledger.append({
      kind: "session-started",
      session: { id: "session-expired", node: node("a") },
      brief: {
        graph: "0001-bootstrap",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("a"),
      session: "session-expired",
      expiry: 1_000,
    });

    ledger.append({
      kind: "session-started",
      session: { id: "session-live", node: node("b") },
      brief: {
        graph: "0001-bootstrap",
        node: "b",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("b"),
      session: "session-live",
      expiry: 5_000,
    });

    ledger.append({
      kind: "session-started",
      session: { id: "session-resolved", node: node("c") },
      brief: {
        graph: "0001-bootstrap",
        node: "c",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("c"),
      session: "session-resolved",
      expiry: 500,
    });
    ledger.append({
      kind: "outcome-set",
      node: node("c"),
      outcome: { kind: "cleared", receipts: [] },
    });

    const abandoned = sweepExpiredLeases(ledger, 2_000);

    expect(abandoned).toEqual(["session-expired"]);
    const view = ledger.projection().nodes.get("0001-bootstrap::a");
    expect(view?.outcome).toEqual(
      outcome.cancelled(
        [],
        ABANDONED_AUTHORITY,
        "lease session-expired expired at 1000 with no outcome",
      ),
    );
    expect(
      ledger.projection().sessions.get("session-expired")?.leaseExpired,
    ).toBe(true);
  });

  it("is idempotent: a second sweep at the same time writes nothing new", () => {
    const ledger = memoryLedger();
    ledger.append({
      kind: "session-started",
      session: { id: "session-expired", node: node("a") },
      brief: {
        graph: "0001-bootstrap",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("a"),
      session: "session-expired",
      expiry: 1_000,
    });

    sweepExpiredLeases(ledger, 2_000);
    const second = sweepExpiredLeases(ledger, 2_000);

    expect(second).toEqual([]);
  });

  it("collects a second dead session on the same node; the first's cancellation does not hide it", () => {
    const ledger = memoryLedger();
    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node: node("a") },
      brief: {
        graph: "0001-bootstrap",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("a"),
      session: "session-1",
      expiry: 1_000,
    });

    const firstSweep = sweepExpiredLeases(ledger, 2_000);
    expect(firstSweep).toEqual(["session-1"]);

    ledger.append({
      kind: "session-started",
      session: { id: "session-2", node: node("a") },
      brief: {
        graph: "0001-bootstrap",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: node("a"),
      session: "session-2",
      expiry: 3_000,
    });

    const secondSweep = sweepExpiredLeases(ledger, 4_000);
    expect(secondSweep).toEqual(["session-2"]);

    const thirdSweep = sweepExpiredLeases(ledger, 5_000);
    expect(thirdSweep).toEqual([]);

    const projection = ledger.projection();
    expect(projection.sessions.get("session-1")?.leaseExpired).toBe(true);
    expect(projection.sessions.get("session-2")?.leaseExpired).toBe(true);
    expect(projection.nodes.get("0001-bootstrap::a")?.outcome).toEqual(
      outcome.cancelled(
        [],
        ABANDONED_AUTHORITY,
        "lease session-2 expired at 3000 with no outcome",
      ),
    );
  });
});
