import { fold, type LedgerEvent } from "ledger";
import { describe, expect, it } from "vitest";
import { liveSessionsOf } from "../src/herdrStatus.ts";

function sessionStarted(session: string, node: string): LedgerEvent {
  return {
    kind: "session-started",
    session: { id: session, node: { graph: "demo", id: node } },
    brief: {
      graph: "demo",
      node,
      role: "worker",
      acceptance: "x",
      gates: [],
      scope: [],
    },
  };
}

describe("liveSessionsOf", () => {
  it("excludes a lease whose expiry has passed the clock, even with no lease-expired event recorded", () => {
    const now = Date.now();
    const events: readonly LedgerEvent[] = [
      sessionStarted("session-1", "a"),
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: now - 60_000,
      },
    ];
    const projection = fold(events);
    expect(liveSessionsOf("demo", projection.sessions, now)).toEqual([]);
  });

  it("includes a lease whose expiry is still ahead of the clock", () => {
    const now = Date.now();
    const events: readonly LedgerEvent[] = [
      sessionStarted("session-1", "a"),
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: now + 60_000,
      },
    ];
    const projection = fold(events);
    expect(
      liveSessionsOf("demo", projection.sessions, now).map(
        (session) => session.session,
      ),
    ).toEqual(["session-1"]);
  });

  it("excludes a lease already marked expired by a sweeper even before its own clock check", () => {
    const now = Date.now();
    const events: readonly LedgerEvent[] = [
      sessionStarted("session-1", "a"),
      {
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: now + 60_000,
      },
      {
        kind: "lease-expired",
        node: { graph: "demo", id: "a" },
        session: "session-1",
      },
    ];
    const projection = fold(events);
    expect(liveSessionsOf("demo", projection.sessions, now)).toEqual([]);
  });
});
