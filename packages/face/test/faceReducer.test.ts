import { describe, expect, it } from "vitest";
import { reduce } from "../src/faceReducer.ts";
import { type FaceKey, type FaceWorld, initialFaceState } from "../src/faceState.ts";
import type { Position } from "../src/position.ts";

const position: Position = {
  interlock: "position@v1",
  graph: "g1",
  approval: "approved",
  nodes: [
    {
      id: "a",
      dependsOn: [],
      state: { kind: "outcome", outcome: { kind: "cleared", receipts: [] } },
      gates: [{ id: "typecheck", state: { kind: "satisfied" } }],
      attempts: [],
      float: { kind: "unknown", because: "a: no receipt carries a duration" },
    },
    {
      id: "b",
      dependsOn: ["a"],
      state: { kind: "ready" },
      gates: [
        {
          id: "blocked-gate",
          state: { kind: "blocked", evidence: "exit 1", because: "broken" },
        },
      ],
      attempts: [
        { session: "s-done", leaseState: { kind: "none" } },
        {
          session: "s-live",
          leaseState: { kind: "live" },
          agentStatus: "working",
        },
      ],
      float: { kind: "unknown", because: "b: no outcome yet" },
    },
  ],
  criticalPath: ["a", "b"],
};

const world: FaceWorld = {
  plans: [
    {
      graph: "g1",
      approval: "approved",
      cleared: 1,
      total: 2,
      liveSessions: 1,
    },
    {
      graph: "g2",
      approval: "not-approved",
      cleared: 0,
      total: 1,
      liveSessions: 0,
    },
  ],
  position,
  by: "rodrigo",
};

const char = (c: string): FaceKey => ({ name: "char", char: c });
const down: FaceKey = { name: "down" };
const up: FaceKey = { name: "up" };
const enter: FaceKey = { name: "enter" };
const escape: FaceKey = { name: "escape" };
const backspace: FaceKey = { name: "backspace" };

describe("reduce: browsing navigation", () => {
  it("moves the cursor down and up at Plans level, clamped to the list bounds", () => {
    const start = initialFaceState();
    const movedDown = reduce(start, down, world).state;
    expect(movedDown).toMatchObject({ level: "plans", index: 1 });

    const clamped = reduce(movedDown, down, world).state;
    expect(clamped).toMatchObject({ level: "plans", index: 1 });

    const movedUp = reduce(clamped, up, world).state;
    expect(movedUp).toMatchObject({ level: "plans", index: 0 });
  });

  it("j and k are synonyms for down and up while browsing", () => {
    const start = initialFaceState();
    const afterJ = reduce(start, char("j"), world).state;
    expect(afterJ).toMatchObject({ level: "plans", index: 1 });
    const afterK = reduce(afterJ, char("k"), world).state;
    expect(afterK).toMatchObject({ level: "plans", index: 0 });
  });

  it("Enter drills from Plans into Graph, selecting the graph under the cursor and resetting the cursor", () => {
    const atSecondGraph = reduce(initialFaceState(), down, world).state;
    const drilled = reduce(atSecondGraph, enter, world).state;
    expect(drilled).toMatchObject({
      level: "graph",
      index: 0,
      selection: { graph: "g2" },
    });
  });

  it("Enter drills from Graph into Node, selecting the node under the cursor", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, world).state;
    const drilled = reduce(atNodeB, enter, world).state;
    expect(drilled).toMatchObject({
      level: "node",
      index: 0,
      selection: { graph: "g1", node: "b" },
    });
  });

  it("at Node level, Enter on a non-live attempt row drills into Session", () => {
    const atNodeB = {
      ...initialFaceState(),
      level: "node" as const,
      index: 1,
      selection: { graph: "g1", node: "b" },
    };
    const reduced = reduce(atNodeB, enter, world);
    expect(reduced.effect).toBeUndefined();
    expect(reduced.state).toMatchObject({
      level: "session",
      selection: { graph: "g1", node: "b", session: "s-done" },
    });
  });

  it("at Node level, Enter on a live attempt row emits a focus effect and stays put", () => {
    const atNodeB = {
      ...initialFaceState(),
      level: "node" as const,
      index: 2,
      selection: { graph: "g1", node: "b" },
    };
    const reduced = reduce(atNodeB, enter, world);
    expect(reduced.effect).toEqual({
      kind: "focus",
      graph: "g1",
      node: "b",
      session: "s-live",
    });
    expect(reduced.state).toBe(atNodeB);
  });

  it("Escape and Backspace both go up one level, resetting the cursor to 0", () => {
    const atNodeB = {
      ...initialFaceState(),
      level: "node" as const,
      index: 1,
      selection: { graph: "g1", node: "b" },
    };
    const afterEscape = reduce(atNodeB, escape, world).state;
    expect(afterEscape).toMatchObject({ level: "graph", index: 0 });

    const afterBackspace = reduce(atNodeB, backspace, world).state;
    expect(afterBackspace).toMatchObject({ level: "graph", index: 0 });
  });

  it("Escape or Backspace at Plans level is a no-op: there is nowhere further up", () => {
    const start = initialFaceState();
    expect(reduce(start, escape, world).state).toEqual(start);
  });

  it("? toggles the help overlay without moving the cursor or firing a verb", () => {
    const start = initialFaceState();
    const withHelp = reduce(start, char("?"), world).state;
    expect(withHelp).toMatchObject({ help: true, index: 0 });
    const withoutHelp = reduce(withHelp, char("?"), world).state;
    expect(withoutHelp).toMatchObject({ help: false });

    const stillHelpAfterA = reduce(withHelp, char("a"), world);
    expect(stillHelpAfterA.state.kind).toBe("browsing");
    expect(stillHelpAfterA.effect).toBeUndefined();
  });

  it("q emits a quit effect and r emits a redraw effect, neither changing level", () => {
    const start = initialFaceState();
    expect(reduce(start, char("q"), world).effect).toEqual({ kind: "quit" });
    expect(reduce(start, char("r"), world).effect).toEqual({ kind: "redraw" });
  });
});

describe("reduce: verbs and accountability", () => {
  it("a non-accountable verb (run) dispatches immediately using the world's by, with no prompt", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, world).state;
    const reduced = reduce(atNodeB, char("R"), world);
    expect(reduced.state.kind).toBe("browsing");
    expect(reduced.effect).toEqual({
      kind: "dispatch",
      verb: { kind: "run", graph: "g1", node: "b" },
      by: "rodrigo",
      because: "",
    });
  });

  it("an accountable verb (cancel) prompts for because, then dispatches once because is filled and by is already known", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, world).state;
    const prompting = reduce(atNodeB, char("c"), world).state;
    expect(prompting).toMatchObject({
      kind: "prompting",
      prompt: {
        verb: { kind: "cancel", graph: "g1", node: "b" },
        field: "because",
      },
    });

    const typed = ["b", "r", "o", "k", "e", "n"].reduce(
      (state, letter) => reduce(state, char(letter), world).state,
      prompting,
    );
    expect(typed).toMatchObject({ prompt: { because: "broken" } });

    const dispatched = reduce(typed, enter, world);
    expect(dispatched.state.kind).toBe("browsing");
    expect(dispatched.effect).toEqual({
      kind: "dispatch",
      verb: { kind: "cancel", graph: "g1", node: "b" },
      by: "rodrigo",
      because: "broken",
    });
  });

  it("an accountable verb prompts for by too when the world carries none", () => {
    const { by: _unusedBy, ...worldWithoutBy } = world;
    const noByWorld: FaceWorld = worldWithoutBy;
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, noByWorld).state;
    const promptingBecause = reduce(atNodeB, char("x"), noByWorld).state;

    const becauseFilled = reduce(promptingBecause, char("y"), noByWorld).state;
    const afterBecauseEnter = reduce(becauseFilled, enter, noByWorld).state;
    expect(afterBecauseEnter).toMatchObject({ prompt: { field: "by" } });

    const byFilled = reduce(afterBecauseEnter, char("m"), noByWorld).state;
    const dispatched = reduce(byFilled, enter, noByWorld);
    expect(dispatched.effect).toEqual({
      kind: "dispatch",
      verb: { kind: "reset", graph: "g1", node: "b" },
      by: "m",
      because: "y",
    });
  });

  it("Escape cancels a prompt and returns to browsing with a status message, dispatching nothing", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, world).state;
    const prompting = reduce(atNodeB, char("c"), world).state;
    const cancelled = reduce(prompting, escape, world);
    expect(cancelled.effect).toBeUndefined();
    expect(cancelled.state).toMatchObject({
      kind: "browsing",
      status: "cancelled",
    });
  });

  it("Backspace during a prompt edits the field's text instead of navigating up", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const atNodeB = reduce(atGraph, down, world).state;
    const prompting = reduce(atNodeB, char("c"), world).state;
    const typed = reduce(reduce(prompting, char("a"), world).state, char("b"), world).state;
    expect(typed).toMatchObject({ prompt: { because: "ab" } });
    const erased = reduce(typed, backspace, world).state;
    expect(erased).toMatchObject({ prompt: { because: "a" } });
  });

  it("waive only fires when the Node-level cursor sits on a gate row, not an attempt row", () => {
    const atNodeOnGate = {
      ...initialFaceState(),
      level: "node" as const,
      index: 0,
      selection: { graph: "g1", node: "b" },
    };
    const onGate = reduce(atNodeOnGate, char("w"), world).state;
    expect(onGate).toMatchObject({
      kind: "prompting",
      prompt: {
        verb: { kind: "waive", graph: "g1", node: "b", gate: "blocked-gate" },
      },
    });

    const atNodeOnAttempt = { ...atNodeOnGate, index: 1 };
    const noOp = reduce(atNodeOnAttempt, char("w"), world);
    expect(noOp.state.kind).toBe("browsing");
    expect(noOp.effect).toBeUndefined();
  });

  it("approve and sweep read as Plans-level verbs targeting the graph under the cursor, or nothing at all", () => {
    const atSecondGraph = reduce(initialFaceState(), down, world).state;
    const approving = reduce(atSecondGraph, char("a"), world).state;
    expect(approving).toMatchObject({
      kind: "prompting",
      prompt: { verb: { kind: "approve", graph: "g2" } },
    });

    const sweeping = reduce(initialFaceState(), char("s"), world);
    expect(sweeping.effect).toEqual({
      kind: "dispatch",
      verb: { kind: "sweep" },
      by: "rodrigo",
      because: "",
    });
  });

  it("backfill reads as a Graph-level verb over the current graph, ignoring the node under the cursor", () => {
    const atGraph = {
      ...initialFaceState(),
      level: "graph" as const,
      selection: { graph: "g1" },
    };
    const reduced = reduce(atGraph, char("b"), world);
    expect(reduced.effect).toEqual({
      kind: "dispatch",
      verb: { kind: "backfill", graph: "g1" },
      by: "rodrigo",
      because: "",
    });
  });
});
