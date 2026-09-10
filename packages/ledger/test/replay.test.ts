import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import { EVENT_SHAPE, upcastTable, type Upcaster } from "../src/envelope.js";
import type { LedgerEvent } from "../src/event.js";
import { gate } from "../src/gate.js";
import { isNode, nodeKey, type Node } from "../src/graph.js";
import { createLedger } from "../src/ledger.js";
import { note } from "../src/note.js";
import { heldOn, outcome } from "../src/outcome.js";
import { fold, type LedgerProjection } from "../src/projection.js";
import { duration, type Receipt } from "../src/receipt.js";
import { parseLine, replayFromRaw } from "../src/replay.js";
import { spend } from "../src/spend.js";
import { upcastV1 } from "../src/upcast/v1.js";
import { isRecord, prop } from "../src/validate.js";

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
    if (parseLine(line).kind !== "event") break;
    count += 1;
  }
  return count;
}

describe("crash-only replay", () => {
  it("replays a truncated sink to the projection of some prefix of the recorded run, at every byte boundary", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));

    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const receipt: Receipt = {
      id: "receipt-1",
      gate: "typecheck",
      commitSha: "deadbeef",
      spend: spend.none(),
      duration: duration.measured(842),
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
      {
        kind: "outcome-set",
        node,
        outcome: outcome.reset([receipt], "Rodrigo Sasaki", "flaky suite"),
      },
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
      expect(replayed._tag).toBe("Ok");
      if (replayed._tag !== "Ok") continue;
      expect(
        sameProjection(replayed.value, fold(events.slice(0, expectedCount))),
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
    const first = unwrap(await createLedger({ clock, directory }));
    for (const event of firstRun) first.append(event);
    await first.close();

    const second = unwrap(await createLedger({ clock, directory }));
    expect(sameProjection(second.projection(), fold(firstRun))).toBe(true);

    const secondRunEvent: LedgerEvent = {
      kind: "lease-expired",
      node,
      session: "session-1",
    };
    second.append(secondRunEvent);
    await second.close();

    const third = unwrap(await createLedger({ clock, directory }));
    expect(
      sameProjection(third.projection(), fold([...firstRun, secondRunEvent])),
    ).toBe(true);
  });
});

describe("replay's versioned upcast seam", () => {
  it("tags every persisted line with the current event shape, first field", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };

    ledger.append({ kind: "node-created", node });
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    const line = raw.split("\n")[0] ?? "";
    const parsed: unknown = JSON.parse(line);
    expect(isRecord(parsed) && Object.keys(parsed)[0]).toBe("interlock");
    expect(isRecord(parsed) && prop(parsed, "interlock")).toBe(EVENT_SHAPE);

    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(
      sameProjection(replayed.value, fold([{ kind: "node-created", node }])),
    ).toBe(true);
  });

  it("refuses a line whose shape tag is not in the upcast table, naming the tag and line", () => {
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const known = JSON.stringify({
      interlock: EVENT_SHAPE,
      kind: "node-created",
      node,
    });
    const unknown = JSON.stringify({
      interlock: "event@v0",
      kind: "node-created",
      node,
    });
    const raw = `${known}\n${unknown}\n`;

    const refused = replayFromRaw(raw);
    expect(refused).toEqual({
      _tag: "Err",
      error: { tag: "event@v0", line: 2 },
    });
  });

  it("refuses a line whose shape tag is registered but whose body fails the guard", () => {
    const table: ReadonlyMap<string, Upcaster> = new Map([
      ...upcastTable,
      ["event@v0", () => undefined],
    ]);
    const raw = JSON.stringify({ interlock: "event@v0", kind: "node-created" });

    const refused = replayFromRaw(raw, table);
    expect(refused).toEqual({
      _tag: "Err",
      error: { tag: "event@v0", line: 1 },
    });
  });

  it("a synthetic upcaster registered in a table composes a legacy shape into a current event", () => {
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const legacyLine = JSON.stringify({
      interlock: "event@v0",
      createdNode: node,
    });
    const table: ReadonlyMap<string, Upcaster> = new Map([
      ...upcastTable,
      [
        "event@v0",
        (raw: unknown) => {
          if (!isRecord(raw)) return undefined;
          const legacyNode = prop(raw, "createdNode");
          return isNode(legacyNode)
            ? { kind: "node-created", node: legacyNode }
            : undefined;
        },
      ],
    ]);

    const replayed = replayFromRaw(legacyLine, table);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(
      sameProjection(replayed.value, fold([{ kind: "node-created", node }])),
    ).toBe(true);
  });

  it("upcasts the real event@v1 fixture so the graph's approved gate is satisfied", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v1-approved.jsonl"),
      "utf-8",
    );
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    const graphNode: Node = { graph: "0001-bootstrap", id: "0001-bootstrap" };
    const approved = replayed.value.nodes
      .get(nodeKey(graphNode))
      ?.gates.get("approved");
    expect(approved?.kind).toBe("satisfied");
  });

  it("upcasts that fixture's v1 receipt to the typed unknown duration, never a coerced number", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v1-approved.jsonl"),
      "utf-8",
    );
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    const graphNode: Node = { graph: "0001-bootstrap", id: "0001-bootstrap" };
    const approved = replayed.value.nodes
      .get(nodeKey(graphNode))
      ?.gates.get("approved");
    expect(
      approved?.kind === "satisfied" ? approved.receipt.duration : undefined,
    ).toEqual({ kind: "unknown" });
  });

  it("upcasts a v1 held outcome to held's gate-failure arm, losslessly", () => {
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const v1Receipt: Omit<Receipt, "duration"> = {
      id: "r1",
      gate: "typecheck",
      commitSha: "deadbeef",
      spend: { kind: "none" },
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      proof: {},
    };
    const legacyLine = JSON.stringify({
      interlock: "event@v1",
      kind: "outcome-set",
      node,
      outcome: {
        kind: "held",
        receipts: [v1Receipt],
        failure: "typecheck failed",
        disposition: "repair",
        because: "a real type error, not flaky",
        expiry: 30_000,
      },
    });

    const replayed = replayFromRaw(legacyLine);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.nodes.get(nodeKey(node))?.outcome).toEqual(
      outcome.held(
        [{ ...v1Receipt, duration: { kind: "unknown" } }],
        heldOn.gateFailure("typecheck failed", "repair"),
        "a real type error, not flaky",
        30_000,
      ),
    );
  });

  it("refuses a v1 reset outcome rather than inventing an authority or a because", () => {
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const legacyLine = JSON.stringify({
      interlock: "event@v1",
      kind: "outcome-set",
      node,
      outcome: { kind: "reset", receipts: [] },
    });

    const refused = replayFromRaw(legacyLine);
    expect(refused).toEqual({
      _tag: "Err",
      error: { tag: "event@v1", line: 1 },
    });
  });

  it("replays the real v1/v2 mixed journal under v3, refusing only what the v1 upcaster itself refuses", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v1-v2-2026-09-10.jsonl"),
      "utf-8",
    );
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const refusedByV1 = lines.filter((line) => {
      const parsed: unknown = JSON.parse(line);
      return (
        isRecord(parsed) &&
        prop(parsed, "interlock") === "event@v1" &&
        upcastV1(parsed) === undefined
      );
    });

    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    expect(parseableEventCount(raw)).toBe(lines.length - refusedByV1.length);
    if (replayed._tag !== "Ok") return;

    const graphNode: Node = { graph: "0001-bootstrap", id: "0001-bootstrap" };
    const approved = replayed.value.nodes
      .get(nodeKey(graphNode))
      ?.gates.get("approved");
    expect(approved?.kind).toBe("satisfied");
  });

  it("a v3 held-on-uncommitted-work outcome round-trips through append and replay", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };

    const held = outcome.held(
      [],
      heldOn.uncommittedWork(3),
      "3 uncommitted path(s) in the worktree; gates judge commits only",
      30_000,
    );
    ledger.append({ kind: "outcome-set", node, outcome: held });
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.nodes.get(nodeKey(node))?.outcome).toEqual(held);
  });

  it("refuses a v1 debrief-filed event: v1 recorded none of the fields debrief@v2 requires", () => {
    const legacyLine = JSON.stringify({
      interlock: "event@v1",
      kind: "debrief-filed",
      session: "session-1",
      debrief: {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        headSha: "deadbeef",
        discoveries: [],
        decisions: [],
        open: [],
      },
    });

    const refused = replayFromRaw(legacyLine);
    expect(refused).toEqual({
      _tag: "Err",
      error: { tag: "event@v1", line: 1 },
    });
  });
});
