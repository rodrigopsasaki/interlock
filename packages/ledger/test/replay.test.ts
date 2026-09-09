import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { afterEach, describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import type { LedgerEvent } from "../src/event.js";
import { gate } from "../src/gate.js";
import type { Node } from "../src/graph.js";
import { createLedger } from "../src/ledger.js";
import { note } from "../src/note.js";
import { outcome } from "../src/outcome.js";
import { fold, type LedgerProjection } from "../src/projection.js";
import type { Receipt } from "../src/receipt.js";
import { parseLine, replayFromRaw } from "../src/replay.js";
import { spend } from "../src/spend.js";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function normalize(value: unknown): unknown {
  if (value instanceof Map) {
    return [...value.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, normalize(v)]);
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, normalize(v)]);
  }
  return value;
}

function sameProjection(a: LedgerProjection, b: LedgerProjection): boolean {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

// Counts via `parseLine` itself, not `events.length`, so the assertion below never begs the question.
function parseableEventCount(raw: string): number {
  let count = 0;
  for (const line of raw.split("\n")) {
    if (parseLine(line) === undefined) break;
    count += 1;
  }
  return count;
}

describe("crash-only replay", () => {
  it("replays a truncated sink to the projection of some prefix of the recorded run, at every byte boundary", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = await createLedger({ clock, directory });

    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const receipt: Receipt = {
      id: "receipt-1",
      gate: "typecheck",
      commitSha: "deadbeef",
      spend: spend.none(),
      derivation: derivation.gate("typecheck", "1", "runner"),
      proof: {},
    };

    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node },
      {
        kind: "session-started",
        session: { id: "session-1", node },
        brief: {
          graph: "0001-bootstrap",
          node: "ledger",
          role: "worker",
          acceptance: "the ledger as a Phyxius journal",
          gates: ["replay", "unrepresentable"],
          scope: ["packages/ledger/src"],
        },
      },
      { kind: "lease-taken", node, session: "session-1", expiry: 30_000 },
      {
        kind: "note-appended",
        session: "session-1",
        note: note.choice("t", "chose x", "because y"),
      },
      {
        kind: "gate-moved",
        node,
        gate: "typecheck",
        to: gate.satisfied(receipt),
      },
      { kind: "receipt-written", node, receipt },
      { kind: "outcome-set", node, outcome: outcome.reset([receipt]) },
      { kind: "lease-expired", node, session: "session-1" },
    ];

    for (const event of events) ledger.append(event);
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    expect(parseableEventCount(raw)).toBe(events.length);

    for (let n = 0; n <= raw.length; n += 1) {
      const prefix = raw.slice(0, n);
      const expectedCount = parseableEventCount(prefix);
      const replayed = replayFromRaw(prefix);
      expect(
        sameProjection(replayed, fold(events.slice(0, expectedCount))),
      ).toBe(true);
    }
  });

  it("a second createLedger over the same directory continues the first run's projection", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };

    const firstRun: readonly LedgerEvent[] = [
      { kind: "node-created", node },
      {
        kind: "session-started",
        session: { id: "session-1", node },
        brief: {
          graph: "0001-bootstrap",
          node: "ledger",
          role: "worker",
          acceptance: "the ledger as a Phyxius journal",
          gates: ["replay"],
          scope: ["packages/ledger/src"],
        },
      },
      { kind: "lease-taken", node, session: "session-1", expiry: 30_000 },
    ];
    const first = await createLedger({ clock, directory });
    for (const event of firstRun) first.append(event);
    await first.close();

    const second = await createLedger({ clock, directory });
    expect(sameProjection(second.projection(), fold(firstRun))).toBe(true);

    const secondRunEvent: LedgerEvent = {
      kind: "lease-expired",
      node,
      session: "session-1",
    };
    second.append(secondRunEvent);
    await second.close();

    const third = await createLedger({ clock, directory });
    expect(
      sameProjection(third.projection(), fold([...firstRun, secondRunEvent])),
    ).toBe(true);
  });
});
