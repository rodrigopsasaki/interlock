import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { EVENT_SHAPE } from "../src/envelope.ts";
import { createLedger } from "../src/ledger.ts";
import { replayFromRaw } from "../src/replay.ts";
import { isSessionFacts, type SessionFacts, sessionFacts } from "../src/sessionFacts.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const known: SessionFacts = {
  promptReceived: "yes",
  lastActivity: "2026-09-25T00:00:00Z",
  usage: { input: 10, cachedInput: 8, output: 2, reasoning: 1 },
  quota: { window: "10080 minutes", usedPercentage: 97.7 },
  deliveryBasis: "record",
};

describe("session-facts@v0", () => {
  it("guards known raw observations and the explicit unknown reading", () => {
    expect(isSessionFacts(known)).toBe(true);
    expect(isSessionFacts(sessionFacts.unknown())).toBe(true);
  });

  it("refuses malformed or inferred observations", () => {
    expect(isSessionFacts({ ...known, promptReceived: false })).toBe(false);
    expect(isSessionFacts({ ...known, lastActivity: "yesterday" })).toBe(false);
    expect(isSessionFacts({ ...known, usage: { input: "10" } })).toBe(false);
    expect(isSessionFacts({ ...known, quota: { window: "10080 minutes" } })).toBe(false);
    expect(isSessionFacts({ ...known, extra: "vendor field" })).toBe(false);
  });

  it("persists and replays the additive observation without replacing the journal", async () => {
    directory = mkdtempSync(join(runsRoot, "facts-"));
    const node = { graph: "0045-session-facts", id: "session-facts-seam" };
    const ledger = unwrap(
      await createLedger({
        clock: createControlledClock({ initialTime: 0 }),
        directory,
      }),
    );
    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node, runtime: "unknown" },
      brief: {
        graph: node.graph,
        node: node.id,
        role: "worker",
        acceptance: "facts",
        gates: [],
        scope: [],
      },
    });
    ledger.append({ kind: "session-facts-observed", session: "session-1", facts: known });
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    expect(raw).toContain(`"interlock":"${EVENT_SHAPE}"`);
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.facts).toEqual(known);
  });

  it("gives a historical session unknown facts when no observation was recorded", () => {
    const raw = JSON.stringify({
      interlock: "event@v6",
      kind: "session-started",
      session: {
        id: "session-1",
        node: { graph: "0001-bootstrap", id: "ledger" },
      },
      brief: {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        acceptance: "the ledger",
        gates: [],
        scope: [],
      },
    });
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.facts).toEqual(sessionFacts.unknown());
  });

  it("keeps only the latest observation in the projection while both remain replayable", () => {
    const first: SessionFacts = { ...sessionFacts.unknown(), lastActivity: "2026-09-25T00:00:00Z" };
    const second: SessionFacts = { ...known, lastActivity: "2026-09-25T00:01:00Z" };
    const raw = [
      {
        interlock: EVENT_SHAPE,
        kind: "session-started",
        session: {
          id: "session-1",
          node: { graph: "0001-bootstrap", id: "ledger" },
          runtime: "unknown",
        },
        brief: {
          graph: "0001-bootstrap",
          node: "ledger",
          role: "worker",
          acceptance: "the ledger",
          gates: [],
          scope: [],
        },
      },
      {
        interlock: EVENT_SHAPE,
        kind: "session-facts-observed",
        session: "session-1",
        facts: first,
      },
      {
        interlock: EVENT_SHAPE,
        kind: "session-facts-observed",
        session: "session-1",
        facts: second,
      },
    ]
      .map((event) => JSON.stringify(event))
      .join("\n");
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.facts).toEqual(second);
  });
});
