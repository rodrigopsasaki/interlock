import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { EVENT_SHAPE } from "../src/envelope.ts";
import { nodeKey } from "../src/graph.ts";
import { createLedger } from "../src/ledger.ts";
import { replayFromRaw } from "../src/replay.ts";
import { isSessionRuntime, type SessionRuntime, sessionRuntime } from "../src/session.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("SessionRuntime: declared and unknown", () => {
  it("constructs a declared runtime carrying name, kind and an optional model", () => {
    const declared = sessionRuntime.declared("luna", "claude", "claude-opus-5-5");
    expect(declared).toEqual({
      name: "luna",
      kind: "claude",
      model: "claude-opus-5-5",
    });
    expect(isSessionRuntime(declared)).toBe(true);
  });

  it("keeps a declared model undeclared rather than inventing one, for the legacy local.yaml block", () => {
    const declared = sessionRuntime.declared("default", "claude", undefined);
    expect(declared).toEqual({
      name: "default",
      kind: "claude",
      model: undefined,
    });
    expect(isSessionRuntime(declared)).toBe(true);
  });

  it("the unknown reading is the literal string, distinct from any declared shape", () => {
    expect(sessionRuntime.unknown()).toBe("unknown");
    expect(isSessionRuntime("unknown")).toBe(true);
  });

  it('rejects a declared shape missing kind, and any other string than "unknown"', () => {
    expect(isSessionRuntime({ name: "luna" })).toBe(false);
    expect(isSessionRuntime("declared")).toBe(false);
    expect(isSessionRuntime(undefined)).toBe(false);
  });
});

describe("session-started: runtime round-trips through append and replay", () => {
  it("a freshly appended declared runtime reads back exactly, tagged at the current shape", async () => {
    directory = mkdtempSync(join(runsRoot, "runtime-"));
    const clock = createControlledClock({ initialTime: 0 });
    const ledger = unwrap(await createLedger({ clock, directory }));
    const node = { graph: "0043-any-runtime", id: "run-with-runtime" };
    const runtime: SessionRuntime = sessionRuntime.declared("luna", "claude", "claude-opus-5-5");

    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node, runtime },
      brief: {
        graph: "0043-any-runtime",
        node: "run-with-runtime",
        role: "worker",
        acceptance: "choose the runtime per attempt",
        gates: ["typecheck"],
        scope: ["packages/runner/src"],
      },
    });
    await ledger.close();

    const raw = readFileSync(join(directory, "journal.jsonl"), "utf-8");
    expect(raw).toContain(`"interlock":"${EVENT_SHAPE}"`);
    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.runtime).toEqual(runtime);
  });
});

describe("session-started: pre-v6 lines upcast their runtime as unknown, never invented", () => {
  it("an event@v1 session-started line, with no runtime field at all, reads as unknown", () => {
    const line = JSON.stringify({
      interlock: "event@v1",
      kind: "session-started",
      session: {
        id: "session-1",
        node: { graph: "0001-bootstrap", id: "ledger" },
      },
      brief: {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        acceptance: "the ledger as a Phyxius journal",
        gates: [],
        scope: [],
      },
    });

    const replayed = replayFromRaw(line);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.runtime).toBe("unknown");
  });

  it("an event@v4 session-started line, with no runtime field at all, reads as unknown", () => {
    const line = JSON.stringify({
      interlock: "event@v4",
      kind: "session-started",
      session: {
        id: "session-1",
        node: { graph: "0001-bootstrap", id: "ledger" },
      },
      brief: {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        acceptance: "the ledger as a Phyxius journal",
        gates: [],
        scope: [],
      },
    });

    const replayed = replayFromRaw(line);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;
    expect(replayed.value.sessions.get("session-1")?.runtime).toBe("unknown");
  });

  it("the real event@v5 fixture (this node's own dependency, before this shape existed) upcasts its runtime as unknown", () => {
    const raw = readFileSync(
      join(import.meta.dirname, "fixtures", "journal-v5-run-with-runtime-2026-09-24.jsonl"),
      "utf-8",
    );

    const replayed = replayFromRaw(raw);
    expect(replayed._tag).toBe("Ok");
    if (replayed._tag !== "Ok") return;

    const started = [...replayed.value.sessions.values()].find(
      (session) => session.node.id === "runtime-catalogue",
    );
    expect(started).toBeDefined();
    expect(started?.runtime).toBe("unknown");

    const node = replayed.value.nodes.get(
      nodeKey({ graph: "0043-any-runtime", id: "runtime-catalogue" }),
    );
    expect(node?.outcome?.kind).toBe("cleared");
  });
});
