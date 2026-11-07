import {
  closeSync,
  fsyncSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import type { Brief } from "../src/brief.js";
import { derivation } from "../src/derivation.js";
import { EVENT_SHAPE, type Upcaster, upcastTable } from "../src/envelope.js";
import type { LedgerEvent } from "../src/event.js";
import { gate } from "../src/gate.js";
import { isNode, type Node, nodeKey } from "../src/graph.js";
import { createLedger } from "../src/ledger.js";
import { note } from "../src/note.js";
import { heldOn, isDecided, outcome, proposeOutcomeMove } from "../src/outcome.js";
import { personSaid } from "../src/personSaid.js";
import { fold, type LedgerProjection } from "../src/projection.js";
import { duration, type Receipt } from "../src/receipt.js";
import { parseLine, readRawEvents, replayFromRaw } from "../src/replay.js";
import { sessionRuntime, UNRECORDED_START } from "../src/session.js";
import { createLedgerSink, type LedgerFileOperations } from "../src/sink.js";
import { spend } from "../src/spend.js";
import { upcastV1 } from "../src/upcast/v1.js";
import { isRecord, prop } from "../src/validate.js";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
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
        session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
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
      expect(sameProjection(replayed.value, fold(events.slice(0, expectedCount)))).toBe(true);
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
        session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
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
    expect(sameProjection(third.projection(), fold([...firstRun, secondRunEvent]))).toBe(true);
  });
});

describe("confirmed append", () => {
  it.each(["write", "fsync"])(
    "does not project or confirm after a createLedgerSink %s failure",
    async (stage) => {
      directory = mkdtempSync(join(runsRoot, "run-"));
      const operations: LedgerFileOperations = {
        mkdir(path) {
          mkdirSync(path, { recursive: true });
        },
        open(path) {
          return openSync(path, "a");
        },
        write(descriptor, content) {
          if (stage === "write") throw new Error("write failed");
          writeFileSync(descriptor, content);
        },
        sync(descriptor) {
          if (stage === "fsync") throw new Error("fsync failed");
          fsyncSync(descriptor);
        },
        close(descriptor) {
          closeSync(descriptor);
        },
      };
      const sink = createLedgerSink(directory, operations);
      const ledger = unwrap(
        await createLedger({
          clock: createControlledClock({ initialTime: 0 }),
          directory,
          sink,
        }),
      );
      const node: Node = { graph: "0001-bootstrap", id: "ledger" };

      expect(ledger.appendConfirmed({ kind: "node-created", node })).toEqual({
        _tag: "Err",
        error: { because: `${stage} failed` },
      });
      expect(ledger.projection().nodes.get(nodeKey(node))).toBeUndefined();
      expect(ledger.appendConfirmed({ kind: "node-created", node })).toEqual({
        _tag: "Err",
        error: { because: `${stage} failed` },
      });
    },
  );
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
    expect(sameProjection(replayed.value, fold([{ kind: "node-created", node }]))).toBe(true);
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
          return isNode(legacyNode) ? { kind: "node-created", node: legacyNode } : undefined;
        },
      ],
    ]);

    const replayed = replayFromRaw(legacyLine, table);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(sameProjection(replayed.value, fold([{ kind: "node-created", node }]))).toBe(true);
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
    const approved = replayed.value.nodes.get(nodeKey(graphNode))?.gates.get("approved");
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
    const approved = replayed.value.nodes.get(nodeKey(graphNode))?.gates.get("approved");
    expect(approved?.kind === "satisfied" ? approved.receipt.duration : undefined).toEqual({
      kind: "unknown",
    });
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
    const approved = replayed.value.nodes.get(nodeKey(graphNode))?.gates.get("approved");
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

  it("replays the real v1-v3 journal fixture without loss, narration events included", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v1-v3-2026-09-11.jsonl"),
      "utf-8",
    );
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);

    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    expect(parseableEventCount(raw)).toBe(lines.length);

    const graphNode: Node = { graph: "0001-bootstrap", id: "0001-bootstrap" };
    if (replayed._tag !== "Ok") return;
    const approved = replayed.value.nodes.get(nodeKey(graphNode))?.gates.get("approved");
    expect(approved?.kind).toBe("satisfied");
  });

  it("projects a sweeper cancellation already in an old journal as an outcome nobody decided", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v1-v3-2026-09-11.jsonl"),
      "utf-8",
    );
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    const sweepLine = lines.findIndex(
      (line) => line.includes('"kind":"cancelled"') && line.includes('"authority":"sweeper"'),
    );
    expect(sweepLine).toBeGreaterThan(-1);

    const replayed = replayFromRaw(lines.slice(0, sweepLine + 1).join("\n"));
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;

    const swept: Node = { graph: "0001-bootstrap", id: "verifier-hunks" };
    const current = replayed.value.nodes.get(nodeKey(swept))?.outcome;
    expect(current).toMatchObject({ kind: "cancelled", authority: "sweeper" });
    if (current === undefined) return;
    expect(isDecided(current)).toBe(false);
    expect(
      proposeOutcomeMove(current, outcome.reset([], "Rodrigo Sasaki", "launch failed"))._tag,
    ).toBe("Ok");
  });

  it("reads an actual event@v4 line and refuses a v5-only outbox event under that old tag", () => {
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };
    const v4 = JSON.stringify({
      interlock: "event@v4",
      kind: "node-created",
      node,
    });
    const replayed = replayFromRaw(v4);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag === "Ok") expect(replayed.value.nodes.get(nodeKey(node))).toBeDefined();
    const v5Only = JSON.stringify({
      interlock: "event@v4",
      kind: "outbox-delivery-recorded",
      delivery: {
        id: "a".repeat(64),
        state: "uncertain",
        because: "doubt",
        derivation: derivation.gate("outbox", "runner@0", "runner"),
      },
    });
    expect(replayFromRaw(v5Only)).toEqual({
      _tag: "Err",
      error: { tag: "event@v4", line: 1 },
    });
  });
});

describe("replay: a question note enters the journal at event@v8", () => {
  const node: Node = { graph: "0046-loom-feed", id: "asked-in-words" };
  const brief: Brief = {
    graph: node.graph,
    node: node.id,
    role: "implementer",
    acceptance: "ask in words",
    gates: [],
    scope: [],
  };
  const started = (tag: string): string =>
    JSON.stringify({
      interlock: tag,
      kind: "session-started",
      session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
      brief,
    });
  const appended = (tag: string, embedded: unknown): string =>
    JSON.stringify({ interlock: tag, kind: "note-appended", session: "session-1", note: embedded });
  const question = note.question("2026-11-05T01:00:00Z", "Merge the walk now?", ["yes", "no"]);
  const choice = note.choice("2026-11-05T00:50:00Z", "kept the walk", "it reads");

  it("round-trips a question note through append and replay, in its words", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
      brief,
    });
    ledger.append({ kind: "note-appended", session: "session-1", note: question });
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    expect(raw).toContain(`"interlock":"${EVENT_SHAPE}"`);
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.notes).toEqual([question]);
  });

  for (const tag of [
    "event@v1",
    "event@v2",
    "event@v3",
    "event@v4",
    "event@v5",
    "event@v6",
    "event@v7",
  ]) {
    it(`replays a choice note under ${tag} unchanged and refuses a question note under it`, () => {
      const older = `${started("event@v8")}\n${appended(tag, choice)}\n`;
      const replayed = replayFromRaw(older);
      expect(replayed._tag).toBe("Ok");
      if (replayed._tag === "Ok") {
        expect(replayed.value.sessions.get("session-1")?.notes).toEqual([choice]);
      }
      expect(replayFromRaw(`${started("event@v8")}\n${appended(tag, question)}\n`)).toEqual({
        _tag: "Err",
        error: { tag, line: 2 },
      });
    });
  }

  it("refuses a question note with options that are not a list of answers", () => {
    const raw = `${started("event@v8")}\n${appended("event@v8", { ...question, options: "yes or no" })}\n`;
    expect(replayFromRaw(raw)).toEqual({ _tag: "Err", error: { tag: "event@v8", line: 2 } });
  });

  for (const file of [
    "journal-v1-approved.jsonl",
    "journal-v1-v2-2026-09-10.jsonl",
    "journal-v1-v3-2026-09-11.jsonl",
    "journal-v5-run-with-runtime-2026-09-24.jsonl",
  ]) {
    it(`replays ${file} to the same events under every upcaster before and after event@v8`, () => {
      const raw = readFileSync(join(import.meta.dirname, "fixtures", file), "utf-8");
      const withoutV8: ReadonlyMap<string, Upcaster> = new Map(
        [...upcastTable].filter(([tag]) => tag !== "event@v8"),
      );
      const before = replayFromRaw(raw, withoutV8);
      const after = replayFromRaw(raw);
      expect(after._tag).toBe("Ok");
      if (before._tag !== "Ok" || after._tag !== "Ok") return;
      expect(sameProjection(before.value, after.value)).toBe(true);
    });
  }
});

describe("replay: a person's words enter the journal at event@v9", () => {
  const node: Node = { graph: "0046-loom-feed", id: "say-into-pane" };
  const brief: Brief = {
    graph: node.graph,
    node: node.id,
    role: "implementer",
    acceptance: "say into the pane",
    gates: [],
    scope: [],
  };
  const question = note.question("2026-11-05T03:50:00Z", "Build on main?", ["yes", "no"]);
  const said = personSaid({
    session: "session-1",
    by: "Rodrigo Sasaki",
    text: "yes",
    at: Date.parse("2026-11-05T04:00:00Z"),
    answers: question,
    because: "main moved",
  });
  const line = (tag: string, event: Record<string, unknown>): string =>
    JSON.stringify({ interlock: tag, ...event });
  const started = line("event@v8", {
    kind: "session-started",
    session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
    brief,
  });
  const asked = line("event@v8", { kind: "note-appended", session: "session-1", note: question });
  const uncertain = {
    kind: "outbox-delivery-recorded",
    delivery: {
      id: said.id,
      state: "uncertain",
      because: "agent_blocked: agent is blocked",
      derivation: derivation.gate("outbox", "runner@0", "interlock session say"),
    },
  };

  it("names event@v10 as the current shape", () => {
    expect(EVENT_SHAPE).toBe("event@v10");
  });

  it("derives the same outbox identity from the same words, and a new one from new words", () => {
    const again = personSaid({
      session: "session-1",
      by: "Rodrigo Sasaki",
      text: "yes",
      at: said.at,
      answers: question,
      because: "main moved",
    });
    expect(again.id).toBe(said.id);
    expect(
      personSaid({ session: "session-1", by: "Rodrigo Sasaki", text: "no", at: said.at }).id,
    ).not.toBe(said.id);
  });

  it("round-trips a person-said and its delivery through append and replay", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node, runtime: sessionRuntime.unknown() },
      brief,
    });
    ledger.append({ kind: "note-appended", session: "session-1", note: question });
    ledger.append({ kind: "person-said", session: "session-1", said });
    ledger.append({
      kind: "outbox-delivery-recorded",
      delivery: {
        id: said.id,
        state: "uncertain",
        because: "agent_blocked: agent is blocked",
        derivation: derivation.gate("outbox", "runner@0", "interlock session say"),
      },
    });
    const live = ledger.projection();
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    expect(raw).toContain(`"interlock":"${EVENT_SHAPE}","kind":"person-said"`);
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(sameProjection(replayed.value, live)).toBe(true);
    const view = replayed.value.sessions.get("session-1")?.said;
    expect(view?.map((entry) => entry.said)).toEqual([said]);
    expect(view?.[0]?.delivery?.state).toBe("uncertain");
  });

  it("leaves a person-said with no delivery recorded after it, as a crash between intent and delivery would", () => {
    const raw = `${started}\n${line("event@v9", { kind: "person-said", session: "session-1", said })}\n`;
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.said).toEqual([{ said, delivery: undefined }]);
  });

  it("ignores a delivery whose identity names neither an outbox intent nor a person-said", () => {
    const raw = `${started}\n${line("event@v9", uncertain)}\n`;
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.said).toEqual([]);
    expect(replayed.value.outbox.size).toBe(0);
  });

  for (const tag of [
    "event@v1",
    "event@v2",
    "event@v3",
    "event@v4",
    "event@v5",
    "event@v6",
    "event@v7",
    "event@v8",
  ]) {
    it(`refuses a person-said under ${tag}, which never carried one`, () => {
      const raw = `${started}\n${line(tag, { kind: "person-said", session: "session-1", said })}\n`;
      expect(replayFromRaw(raw)).toEqual({ _tag: "Err", error: { tag, line: 2 } });
    });
  }

  it("replays an event@v8 journal with a question note unchanged under event@v9", () => {
    const raw = `${started}\n${asked}\n`;
    const withoutV9: ReadonlyMap<string, Upcaster> = new Map(
      [...upcastTable].filter(([tag]) => tag !== "event@v9"),
    );
    const before = replayFromRaw(raw, withoutV9);
    const after = replayFromRaw(raw);
    expect(before._tag).toBe("Ok");
    expect(after._tag).toBe("Ok");
    if (before._tag !== "Ok" || after._tag !== "Ok") return;
    expect(sameProjection(before.value, after.value)).toBe(true);
    expect(after.value.sessions.get("session-1")?.notes).toEqual([question]);
  });

  it("refuses a person-said whose identity is not an outbox identity", () => {
    const raw = `${started}\n${line("event@v9", { kind: "person-said", session: "session-1", said: { ...said, id: "not-a-sha" } })}\n`;
    expect(replayFromRaw(raw)).toEqual({ _tag: "Err", error: { tag: "event@v9", line: 2 } });
  });

  for (const file of [
    "journal-v1-approved.jsonl",
    "journal-v1-v2-2026-09-10.jsonl",
    "journal-v1-v3-2026-09-11.jsonl",
    "journal-v5-run-with-runtime-2026-09-24.jsonl",
  ]) {
    it(`replays ${file} to the same projection with and without the event@v9 reader`, () => {
      const raw = readFileSync(join(import.meta.dirname, "fixtures", file), "utf-8");
      const withoutV9: ReadonlyMap<string, Upcaster> = new Map(
        [...upcastTable].filter(([tag]) => tag !== "event@v9"),
      );
      const before = replayFromRaw(raw, withoutV9);
      const after = replayFromRaw(raw);
      expect(after._tag).toBe("Ok");
      if (before._tag !== "Ok" || after._tag !== "Ok") return;
      expect(sameProjection(before.value, after.value)).toBe(true);
    });
  }
});

describe("readRawEvents", () => {
  it("returns the flat event history a projection folds away, unfolded and in order", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    const node: Node = { graph: "0001-bootstrap", id: "ledger" };

    const events: readonly LedgerEvent[] = [
      { kind: "node-created", node },
      {
        kind: "outcome-set",
        node,
        outcome: outcome.reset([], "Rodrigo Sasaki", "flaky suite"),
      },
      { kind: "outcome-set", node, outcome: { kind: "cleared", receipts: [] } },
    ];
    for (const event of events) ledger.append(event);
    await ledger.close();

    const read = await readRawEvents(directory);
    expect(read._tag).toBe("Ok");
    if (read._tag !== "Ok") return;
    // Each line's own current-version upcaster is the identity, envelope tag included (the same
    // shape replayFromRaw's own Ok branch folds away); readRawEvents is a mechanical wire-to-event
    // decode, not a re-validation, so it is compared field by field rather than by strict equality.
    expect(read.value.map((event) => event.kind)).toEqual(events.map((event) => event.kind));

    const projection = fold(read.value);
    expect(projection.nodes.get(nodeKey(node))?.outcome).toEqual({
      kind: "cleared",
      receipts: [],
    });
  });

  it("a directory with no journal yet reads as no events, never a missing-file error", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const read = await readRawEvents(directory);
    expect(read).toEqual({ _tag: "Ok", value: [] });
  });

  it("refuses on the same line and tag replayFromRaw would, since both parse the same way", async () => {
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
    directory = mkdtempSync(join(runsRoot, "run-"));
    const raw = `${known}\n${unknown}\n`;
    writeFileSync(join(directory, "journal.jsonl"), raw);

    const read = await readRawEvents(directory);
    expect(read).toEqual({ _tag: "Err", error: { tag: "event@v0", line: 2 } });
    expect(replayFromRaw(raw)).toEqual({
      _tag: "Err",
      error: { tag: "event@v0", line: 2 },
    });
  });
});

describe("replay: a session's recorded start", () => {
  const node = { graph: "g", id: "n" };
  const brief = {
    graph: "g",
    node: "n",
    role: "implementer",
    acceptance: "a",
    gates: [],
    scope: [],
  };
  const started = (interlock: string, extra: Record<string, unknown>) =>
    JSON.stringify({
      interlock,
      kind: "session-started",
      session: { id: "s", node, runtime: { name: "r", kind: "k", model: "m" } },
      brief,
      ...extra,
    });

  it("reads startedAt back as a known epoch-millisecond start", () => {
    const replayed = unwrap(
      replayFromRaw(`${started(EVENT_SHAPE, { startedAt: 1_762_300_000_000 })}\n`),
    );
    expect(replayed.sessions.get("s")?.startedAt).toEqual({
      state: "known",
      epochMs: 1_762_300_000_000,
    });
  });

  it("reads a historical session with no startedAt as unknown with the reason, at every version that carries none", () => {
    for (const version of ["event@v6", "event@v8", EVENT_SHAPE]) {
      const replayed = unwrap(replayFromRaw(`${started(version, {})}\n`));
      expect(replayed.sessions.get("s")?.startedAt).toEqual({
        state: "unknown",
        because: UNRECORDED_START,
      });
    }
  });

  it("refuses a startedAt that is not an epoch-millisecond integer", () => {
    expect(parseLine(started(EVENT_SHAPE, { startedAt: 0 })).kind).toBe("event");
    for (const startedAt of ["2026-11-05", -1, 1.5]) {
      expect(parseLine(started(EVENT_SHAPE, { startedAt })).kind).not.toBe("event");
    }
  });
});
