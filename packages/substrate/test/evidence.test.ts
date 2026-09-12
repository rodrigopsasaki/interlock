import { derivation, duration, gate, mark, type Outcome, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { evidenceOf, type EvidenceSession } from "../src/evidence.ts";

const D = derivation.gate("verifier-hunks", "verifier@0", "test");
const node = { graph: "0003-translator", id: "evidence" };

const clearedOutcome = (receipts: EvidenceSession["receipts"]): Outcome => ({
  kind: "cleared",
  receipts,
});

function baseSession(
  overrides: Partial<EvidenceSession> = {},
): EvidenceSession {
  return {
    derivation: {
      kind: "agent",
      runtime: "claude-code",
      model: "claude-sonnet-5",
    },
    decisions: [],
    discoveries: [],
    receipts: [],
    outcome: clearedOutcome([]),
    personEvents: [],
    ...overrides,
  };
}

describe("evidenceOf: decisions", () => {
  it("turns a decision every one of whose hunks is rooted into a hypothesis decision item", () => {
    const items = evidenceOf(
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
    const items = evidenceOf(
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
            marks: [
              mark.rooted(D, "a.ts:1"),
              mark.unrooted(D, "not a file changed"),
            ],
          },
        ],
      }),
    );
    expect(items).toEqual([]);
  });

  it("excludes a decision with no hunks at all -- zero marks, nothing to root", () => {
    const items = evidenceOf(
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
    expect(single[0]?.scope).toEqual({ kind: "path", path: "a.ts" });

    const multi = evidenceOf(
      baseSession({
        decisions: [
          {
            decision: {
              id: "c1",
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
    expect(multi[0]?.scope).toEqual({ kind: "repository" });
  });

  it("carries a human-authored debrief's derivation as human:<who>", () => {
    const items = evidenceOf(
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

describe("evidenceOf: discoveries", () => {
  it("turns a rooted discovery into a hypothesis item, kinded by its own words", () => {
    const items = evidenceOf(
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
        standing: "hypothesis",
        derivation: "agent:claude-code:claude-sonnet-5",
      },
    ]);
  });

  it("excludes an unrooted discovery, and it is never counted as an item", () => {
    const items = evidenceOf(
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

describe("evidenceOf: receipts", () => {
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

  it("a receipt present in the outcome's own receipts is discipline, observed", () => {
    const items = evidenceOf(
      baseSession({
        receipts: [satisfiedReceipt],
        outcome: clearedOutcome([satisfiedReceipt]),
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

  it("a receipt absent from the outcome's own receipts is risk, observed", () => {
    const items = evidenceOf(
      baseSession({
        receipts: [satisfiedReceipt, blockedReceipt],
        outcome: {
          kind: "held",
          receipts: [satisfiedReceipt, blockedReceipt],
          on: { kind: "gate-failure", failure: "lint", disposition: "hold" },
          because: "lint failed",
          expiry: 0,
        },
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
    const items = evidenceOf(
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
    expect(items).toEqual([
      {
        kind: "decision",
        statement: "waived gate lint",
        because: "flaky today",
        standing: "professed",
        derivation: "human:Rodrigo Sasaki",
      },
    ]);
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
    const items = evidenceOf(
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
    const items = evidenceOf(
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
    const items = evidenceOf(
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
    const items = evidenceOf(
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
    const items = evidenceOf(
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
