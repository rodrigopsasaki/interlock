import { derivation, duration, gate, mark, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { type EvidenceSession, evidenceOf, personEventsFor } from "../src/evidence.ts";

const D = derivation.gate("verifier-hunks", "verifier@0", "test");
const node = { graph: "0003-translator", id: "evidence" };

function baseSession(overrides: Partial<EvidenceSession> = {}): EvidenceSession {
  return {
    derivation: {
      kind: "agent",
      runtime: "claude-code",
      model: "claude-sonnet-5",
    },
    decisions: [],
    discoveries: [],
    receipts: [],
    personEvents: [],
    harnessAuthorities: new Set(),
    ...overrides,
  };
}

describe("evidenceOf: decisions", () => {
  it("turns a decision every one of whose hunks is rooted into a hypothesis decision item", () => {
    const { items } = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c1",
              what: "kept the ajv registry local",
              because: "schemas depends on runner",
              restsOn: [],
              hunks: ["packages/substrate/src/registry.ts:1-13"],
            },
            marks: [mark.rooted(D, "packages/substrate/src/registry.ts:1-13")],
          },
        ],
      }),
    );

    expect(items).toEqual([
      {
        kind: "decision",
        statement: "kept the ajv registry local",
        because: "schemas depends on runner",
        scope: { kind: "path", path: "packages/substrate/src/registry.ts" },
        standing: "hypothesis",
        derivation: "agent:claude-code:claude-sonnet-5",
      },
    ]);
  });

  it("excludes a decision with any unrooted mark, and never counts it as an item", () => {
    const { items } = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c1",
              what: "did a thing",
              because: "test",
              restsOn: [],
              hunks: ["a.ts:1", "b.ts:1"],
            },
            marks: [mark.rooted(D, "a.ts:1"), mark.unrooted(D, "not a file changed")],
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("excludes a decision with no hunks at all -- zero marks, nothing to root", () => {
    const { items } = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c1",
              what: "did a thing",
              because: "test",
              restsOn: [],
              hunks: [],
            },
            marks: [],
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("scopes a single-path decision to that path, and a multi-path decision to the repository", () => {
    const single = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c1",
              what: "x",
              because: "y",
              restsOn: [],
              hunks: ["a.ts:1-2", "a.ts:5"],
            },
            marks: [mark.rooted(D, "a.ts:1-2"), mark.rooted(D, "a.ts:5")],
          },
        ],
      }),
    );
    expect(single.items[0]?.scope).toEqual({ kind: "path", path: "a.ts" });
    expect(single.gaps).toEqual([]);

    const multi = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c9",
              what: "x",
              because: "y",
              restsOn: [],
              hunks: ["a.ts", "b.ts"],
            },
            marks: [mark.rooted(D, "a.ts"), mark.rooted(D, "b.ts")],
          },
        ],
      }),
    );
    expect(multi.items[0]?.scope).toEqual({ kind: "repository" });
    expect(multi.gaps).toEqual([
      {
        term: "decision c9 scope",
        nearest: "path",
        difference: expect.stringContaining("cites 2 paths"),
      },
    ]);
  });

  it("carries a human-authored debrief's derivation as human:<who>", () => {
    const { items } = evidenceOf(
      baseSession({
        derivation: { kind: "human", who: "Rodrigo Sasaki" },
        decisions: [
          {
            decision: {
              id: "c1",
              what: "x",
              because: "y",
              restsOn: [],
              hunks: ["a.ts"],
            },
            marks: [mark.rooted(D, "a.ts")],
          },
        ],
      }),
    );
    expect(items[0]?.derivation).toBe("human:Rodrigo Sasaki");
  });
});

describe("evidenceOf: discoveries carry a location", () => {
  it("turns a rooted discovery into a hypothesis item, kinded by its own words and scoped to its path", () => {
    const { items } = evidenceOf(
      baseSession({
        discoveries: [
          {
            discovery: {
              id: "d1",
              what: "config@v0 has no field for a domain vocabulary",
              foundAt: ".interlock/config.yaml",
              matteredBecause: "every domain term becomes a gap today",
            },
            mark: mark.rooted(D, ".interlock/config.yaml"),
          },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "absence",
        statement: "config@v0 has no field for a domain vocabulary",
        because: "every domain term becomes a gap today",
        scope: { kind: "path", path: ".interlock/config.yaml" },
        standing: "hypothesis",
        derivation: "agent:claude-code:claude-sonnet-5",
      },
    ]);
  });

  it("scopes a discovery rooted at a command to the repository", () => {
    const { items } = evidenceOf(
      baseSession({
        discoveries: [
          {
            discovery: {
              id: "d1",
              what: "something found by running a command",
              foundAt: "$ pnpm test",
              matteredBecause: "test",
            },
            mark: mark.rooted(D, "command"),
          },
        ],
      }),
    );
    expect(items[0]?.scope).toEqual({ kind: "repository" });
  });

  it("scopes a discovery rooted at an out-of-band citation to the repository", () => {
    const { items } = evidenceOf(
      baseSession({
        discoveries: [
          {
            discovery: {
              id: "d1",
              what: "something found in a quote with no resolvable path",
              foundAt: '"a quoted fact"',
              matteredBecause: "test",
            },
            mark: mark.rooted(D, "out-of-band citation"),
          },
        ],
      }),
    );
    expect(items[0]?.scope).toEqual({ kind: "repository" });
  });

  it("excludes an unrooted discovery, and it is never counted as an item", () => {
    const { items } = evidenceOf(
      baseSession({
        discoveries: [
          {
            discovery: {
              id: "d1",
              what: "something",
              foundAt: "nowhere.ts",
              matteredBecause: "test",
            },
            mark: mark.unrooted(D, "nowhere.ts is not a file"),
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });
});

describe("evidenceOf: receipts, classified from the gate-moved history", () => {
  const satisfiedReceipt = {
    id: "r1",
    gate: "typecheck",
    commitSha: "a".repeat(40),
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate("typecheck", "runner@0", "run-1"),
    proof: { exitCode: 0 },
  };
  const blockedReceipt = {
    id: "r2",
    gate: "lint",
    commitSha: "a".repeat(40),
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate("lint", "runner@0", "run-1"),
    proof: { exitCode: 1 },
  };

  it("a receipt referenced by a gate-moved to satisfied is discipline, observed", () => {
    const { items } = evidenceOf(
      baseSession({
        receipts: [satisfiedReceipt],
        personEvents: [
          { kind: "gate-moved", node, gate: "typecheck", to: gate.satisfied(satisfiedReceipt) },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "discipline",
        statement: "gate typecheck satisfied",
        standing: "observed",
        derivation: "gate:typecheck:runner@0:run-1",
      },
    ]);
  });

  it("a receipt never referenced by a satisfied or waived gate-moved is risk, observed", () => {
    const { items } = evidenceOf(
      baseSession({
        receipts: [satisfiedReceipt, blockedReceipt],
        personEvents: [
          { kind: "gate-moved", node, gate: "typecheck", to: gate.satisfied(satisfiedReceipt) },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "discipline",
        statement: "gate typecheck satisfied",
        standing: "observed",
        derivation: "gate:typecheck:runner@0:run-1",
      },
      {
        kind: "risk",
        statement: "gate lint blocked",
        standing: "observed",
        derivation: "gate:lint:runner@0:run-1",
      },
    ]);
  });

  it("an exit-1 receipt on a since-cleared node yields a risk item, never discipline", () => {
    const staleFailingReceipt = {
      id: "r-attempt-1",
      gate: "typecheck",
      commitSha: "a".repeat(40),
      spend: spend.none(),
      duration: duration.unknown(),
      derivation: derivation.gate("typecheck", "runner@0", "run-1"),
      proof: { exitCode: 1 },
    };
    const freshPassingReceipt = {
      id: "r-attempt-2",
      gate: "typecheck",
      commitSha: "a".repeat(40),
      spend: spend.none(),
      duration: duration.unknown(),
      derivation: derivation.gate("typecheck", "runner@0", "run-2"),
      proof: { exitCode: 0 },
    };
    const { items } = evidenceOf(
      baseSession({
        receipts: [staleFailingReceipt, freshPassingReceipt],
        personEvents: [
          {
            kind: "gate-moved",
            node,
            gate: "typecheck",
            to: gate.satisfied(freshPassingReceipt),
          },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "risk",
        statement: "gate typecheck blocked",
        standing: "observed",
        derivation: "gate:typecheck:runner@0:run-1",
      },
      {
        kind: "discipline",
        statement: "gate typecheck satisfied",
        standing: "observed",
        derivation: "gate:typecheck:runner@0:run-2",
      },
    ]);
  });

  it("a receipt referenced by a gate-moved to waived is discipline, observed", () => {
    const { items } = evidenceOf(
      baseSession({
        receipts: [blockedReceipt],
        personEvents: [
          {
            kind: "gate-moved",
            node,
            gate: "lint",
            to: gate.waived("Rodrigo Sasaki", "flaky today", blockedReceipt),
          },
        ],
      }),
    );
    expect(items).toContainEqual(
      expect.objectContaining({ kind: "discipline", statement: "gate lint satisfied" }),
    );
  });
});

describe("evidenceOf: a person's verbs", () => {
  const waivedReceipt = {
    id: "r1",
    gate: "lint",
    commitSha: "a".repeat(40),
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate("lint", "runner@0", "run-1"),
    proof: {},
  };

  it("waive is a professed decision, human:<authority>, carrying the waiver's because", () => {
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "gate-moved",
            node,
            gate: "lint",
            to: gate.waived("Rodrigo Sasaki", "flaky today", waivedReceipt),
          },
        ],
      }),
    );
    expect(items).toContainEqual({
      kind: "decision",
      statement: "waived gate lint",
      because: "flaky today",
      standing: "professed",
      derivation: "human:Rodrigo Sasaki",
    });
  });

  it("approve (a gate-moved satisfied receipt with a human derivation) reads its because from the receipt's own proof", () => {
    const approvedReceipt = {
      id: "r2",
      gate: "approved",
      commitSha: "a".repeat(40),
      spend: spend.none(),
      duration: duration.unknown(),
      derivation: derivation.human("Rodrigo Sasaki"),
      proof: { because: "reviewed the plan by hand" },
    };
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "gate-moved",
            node,
            gate: "approved",
            to: gate.satisfied(approvedReceipt),
          },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "decision",
        statement: "approved gate approved",
        because: "reviewed the plan by hand",
        standing: "professed",
        derivation: "human:Rodrigo Sasaki",
      },
    ]);
  });

  it("a satisfied gate from a command-gate derivation (not human) is not a person's verb", () => {
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "gate-moved",
            node,
            gate: "typecheck",
            to: gate.satisfied({
              id: "r3",
              gate: "typecheck",
              commitSha: "a".repeat(40),
              spend: spend.none(),
              duration: duration.unknown(),
              derivation: derivation.gate("typecheck", "runner@0", "run-1"),
              proof: {},
            }),
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("cancel and reset are each a professed decision, human:<authority>", () => {
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "outcome-set",
            node,
            outcome: {
              kind: "cancelled",
              receipts: [],
              authority: "Rodrigo Sasaki",
              because: "no longer needed",
            },
          },
          {
            kind: "outcome-set",
            node,
            outcome: {
              kind: "reset",
              receipts: [],
              authority: "Rodrigo Sasaki",
              because: "flaky suite",
            },
          },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "decision",
        statement: "cancelled this node",
        because: "no longer needed",
        standing: "professed",
        derivation: "human:Rodrigo Sasaki",
      },
      {
        kind: "decision",
        statement: "reset this node",
        because: "flaky suite",
        standing: "professed",
        derivation: "human:Rodrigo Sasaki",
      },
    ]);
  });

  it("a cleared outcome-set (no authority) produces no person-verb item", () => {
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "outcome-set",
            node,
            outcome: { kind: "cleared", receipts: [] },
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("an unrelated event kind (note-appended) produces no item", () => {
    const { items } = evidenceOf(
      baseSession({
        personEvents: [
          {
            kind: "note-appended",
            session: "s1",
            note: {
              kind: "choice",
              at: "2026-09-12T00:00:00Z",
              chose: "x",
              because: "y",
            },
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });
});

describe("evidenceOf: the harness is not a person", () => {
  it("a sweeper cancellation yields no professed item", () => {
    const { items } = evidenceOf(
      baseSession({
        harnessAuthorities: new Set(["sweeper"]),
        personEvents: [
          {
            kind: "outcome-set",
            node,
            outcome: {
              kind: "cancelled",
              receipts: [],
              authority: "sweeper",
              because: "lease s1 expired at 1789044800725 with no outcome",
            },
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("a reset by a harness authority yields no professed item", () => {
    const { items } = evidenceOf(
      baseSession({
        harnessAuthorities: new Set(["sweeper"]),
        personEvents: [
          {
            kind: "outcome-set",
            node,
            outcome: { kind: "reset", receipts: [], authority: "sweeper", because: "swept" },
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("a cancellation by an authority outside the harness set is still a person's verb", () => {
    const { items } = evidenceOf(
      baseSession({
        harnessAuthorities: new Set(["sweeper"]),
        personEvents: [
          {
            kind: "outcome-set",
            node,
            outcome: {
              kind: "cancelled",
              receipts: [],
              authority: "Rodrigo Sasaki",
              because: "no longer needed",
            },
          },
        ],
      }),
    );
    expect(items).toEqual([
      {
        kind: "decision",
        statement: "cancelled this node",
        because: "no longer needed",
        standing: "professed",
        derivation: "human:Rodrigo Sasaki",
      },
    ]);
  });
});

describe("evidenceOf: determinism", () => {
  it("is deterministic: the same session translates identically across repeated calls", () => {
    const session = baseSession({
      harnessAuthorities: new Set(["sweeper"]),
      decisions: [
        {
          decision: {
            id: "c1",
            what: "kept the ajv registry local",
            because: "schemas depends on runner",
            restsOn: [],
            hunks: ["a.ts", "b.ts"],
          },
          marks: [mark.rooted(D, "a.ts"), mark.rooted(D, "b.ts")],
        },
      ],
      discoveries: [
        {
          discovery: {
            id: "d1",
            what: "config@v0 has no field for a domain vocabulary",
            foundAt: ".interlock/config.yaml",
            matteredBecause: "every domain term becomes a gap today",
          },
          mark: mark.rooted(D, ".interlock/config.yaml"),
        },
      ],
      receipts: [
        {
          id: "r1",
          gate: "typecheck",
          commitSha: "a".repeat(40),
          spend: spend.none(),
          duration: duration.unknown(),
          derivation: derivation.gate("typecheck", "runner@0", "run-1"),
          proof: { exitCode: 0 },
        },
      ],
      personEvents: [
        {
          kind: "gate-moved",
          node,
          gate: "typecheck",
          to: gate.satisfied({
            id: "r1",
            gate: "typecheck",
            commitSha: "a".repeat(40),
            spend: spend.none(),
            duration: duration.unknown(),
            derivation: derivation.gate("typecheck", "runner@0", "run-1"),
            proof: { exitCode: 0 },
          }),
        },
        {
          kind: "outcome-set",
          node,
          outcome: {
            kind: "cancelled",
            receipts: [],
            authority: "sweeper",
            because: "lease expired",
          },
        },
      ],
    });

    expect(evidenceOf(session)).toEqual(evidenceOf(session));
  });
});

describe("personEventsFor", () => {
  const other = { graph: "0003-translator", id: "other-node" };
  const graphNode = { graph: node.graph, id: node.graph };

  it("keeps only gate-moved and outcome-set events for the given node", () => {
    const events = [
      { kind: "gate-moved" as const, node, gate: "lint", to: gate.pending() },
      {
        kind: "gate-moved" as const,
        node: other,
        gate: "lint",
        to: gate.pending(),
      },
      {
        kind: "outcome-set" as const,
        node,
        outcome: { kind: "cleared" as const, receipts: [] },
      },
      {
        kind: "note-appended" as const,
        session: "s1",
        note: { kind: "choice" as const, at: "t", chose: "x", because: "y" },
      },
    ];
    expect(personEventsFor(node, events)).toEqual([events[0], events[2]]);
  });

  it("includes the graph's own approved gate-moved event, since it authorises every one of its nodes", () => {
    const events = [
      { kind: "gate-moved" as const, node: graphNode, gate: "approved", to: gate.pending() },
      {
        kind: "gate-moved" as const,
        node: graphNode,
        gate: "some-other-graph-gate",
        to: gate.pending(),
      },
    ];
    expect(personEventsFor(node, events)).toEqual([events[0]]);
  });
});
