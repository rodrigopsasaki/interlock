import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.js";
import { gate } from "../src/gate.js";
import {
  buildCleared,
  heldOn,
  outcome,
  proposeOutcomeMove,
  type Outcome,
} from "../src/outcome.js";
import { duration, type Receipt } from "../src/receipt.js";
import { spend } from "../src/spend.js";

function receiptFor(gateId: string): Receipt {
  return {
    id: `receipt-${gateId}`,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate(gateId, "1", "runner"),
    proof: {},
  };
}

describe("buildCleared", () => {
  it("clears when every declared gate is satisfied or waived", () => {
    const gates = new Map([
      ["typecheck", gate.satisfied(receiptFor("typecheck"))],
      [
        "test",
        gate.waived("Rodrigo Sasaki", "known flaky suite", receiptFor("test")),
      ],
    ]);
    const result = buildCleared(["typecheck", "test"], gates);
    expect(result._tag).toBe("Ok");
    if (result._tag === "Ok") {
      expect(result.value).toEqual({
        kind: "cleared",
        receipts: [receiptFor("typecheck"), receiptFor("test")],
      });
    }
  });

  it("clears vacuously when no gates are declared", () => {
    const result = buildCleared([], new Map());
    expect(result).toEqual({
      _tag: "Ok",
      value: { kind: "cleared", receipts: [] },
    });
  });
});

describe("outcome factories", () => {
  it("carries a failed gate's failure and disposition as data on held, never a second word", () => {
    const held = outcome.held(
      [],
      heldOn.gateFailure("typecheck failed", "repair"),
      "a real type error, not flaky",
      30_000,
    );
    expect(held).toEqual({
      kind: "held",
      receipts: [],
      on: {
        kind: "gate-failure",
        failure: "typecheck failed",
        disposition: "repair",
      },
      because: "a real type error, not flaky",
      expiry: 30_000,
    });
  });

  it("carries a path count as data on held-for-uncommitted-work, no gate involved at all", () => {
    const held = outcome.held(
      [],
      heldOn.uncommittedWork(4),
      "4 uncommitted path(s) in the worktree; gates judge commits only",
      30_000,
    );
    expect(held).toEqual({
      kind: "held",
      receipts: [],
      on: { kind: "uncommitted-work", paths: 4 },
      because:
        "4 uncommitted path(s) in the worktree; gates judge commits only",
      expiry: 30_000,
    });
  });

  it("carries a decision's authority as data on held, with no failure at all", () => {
    const held = outcome.held(
      [],
      heldOn.decision("Rodrigo Sasaki"),
      "waiting on a call only a person makes",
      30_000,
    );
    expect(held).toEqual({
      kind: "held",
      receipts: [],
      on: { kind: "decision", authority: "Rodrigo Sasaki" },
      because: "waiting on a call only a person makes",
      expiry: 30_000,
    });
  });

  it("carries authority and because on reset, the same as on cancelled and superseded", () => {
    expect(
      outcome.reset([], "Rodrigo Sasaki", "flaky suite, re-running"),
    ).toMatchObject({
      kind: "reset",
      authority: "Rodrigo Sasaki",
      because: "flaky suite, re-running",
    });
  });

  it("carries authority and because on cancelled and superseded", () => {
    expect(
      outcome.cancelled([], "Rodrigo Sasaki", "acceptance re-versioned"),
    ).toMatchObject({
      kind: "cancelled",
      authority: "Rodrigo Sasaki",
      because: "acceptance re-versioned",
    });
    expect(
      outcome.superseded([], "Rodrigo Sasaki", "acceptance re-versioned"),
    ).toMatchObject({
      kind: "superseded",
      authority: "Rodrigo Sasaki",
      because: "acceptance re-versioned",
    });
  });
});

describe("proposeOutcomeMove", () => {
  const cancelled = outcome.cancelled([], "Rodrigo Sasaki", "because");
  const reset = outcome.reset([], "Rodrigo Sasaki", "because");

  it("allows a move when no outcome is recorded yet", () => {
    const result = proposeOutcomeMove(undefined, cancelled);
    expect(result).toEqual({ _tag: "Ok", value: cancelled });
  });

  it("allows a move off a held outcome", () => {
    const held = outcome.held(
      [],
      heldOn.decision("Rodrigo Sasaki"),
      "waiting on a call only a person makes",
      30_000,
    );
    expect(proposeOutcomeMove(held, reset)).toEqual({
      _tag: "Ok",
      value: reset,
    });
  });

  it("allows a move off a reset outcome", () => {
    expect(proposeOutcomeMove(reset, cancelled)).toEqual({
      _tag: "Ok",
      value: cancelled,
    });
  });

  const terminalOutcomes: readonly Outcome[] = [
    { kind: "cleared", receipts: [] },
    {
      kind: "failed",
      receipts: [],
      failure: "typecheck failed",
      disposition: "terminal-failure",
      because: "budget spent",
    },
    cancelled,
    outcome.superseded([], "Rodrigo Sasaki", "acceptance re-versioned"),
  ];

  it.each(terminalOutcomes)(
    "refuses a move off a terminal $kind outcome, naming the rule",
    (terminal) => {
      const result = proposeOutcomeMove(terminal, reset);
      expect(result).toEqual({
        _tag: "Err",
        error: {
          kind: "illegal-transition",
          from: terminal.kind,
          to: "reset",
        },
      });
    },
  );
});
