import { join } from "node:path";
import { unwrap } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { derivation, type Derivation } from "../src/derivation.js";
import { gate, isGate, proposeGateMove, type Gate } from "../src/gate.js";
import { createLease, renewLease } from "../src/lease.js";
import { mark, type Mark } from "../src/mark.js";
import {
  buildCleared,
  heldOn,
  outcome,
  type HeldOn,
  type Outcome,
} from "../src/outcome.js";
import {
  createReceipt,
  duration,
  isReceipt,
  receiptId,
  type Receipt,
} from "../src/receipt.js";
import type { Spend } from "../src/spend.js";

const node = { graph: "0001-bootstrap", id: "ledger" };
const okReceipt: Receipt = {
  id: "r1",
  gate: "typecheck",
  commitSha: "deadbeef",
  spend: { kind: "none" },
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1", "runner"),
  proof: {},
};

describe("illegal states are unrepresentable or refused", () => {
  it("cleared cannot be built without every declared gate satisfied or waived", () => {
    const missingEntirely = buildCleared(["typecheck"], new Map());
    expect(missingEntirely).toEqual({
      _tag: "Err",
      error: { kind: "gate-not-cleared", missing: ["typecheck"] },
    });

    const stillPending = buildCleared(
      ["typecheck"],
      new Map([["typecheck", gate.pending()]]),
    );
    expect(stillPending).toEqual({
      _tag: "Err",
      error: { kind: "gate-not-cleared", missing: ["typecheck"] },
    });

    const blocked = buildCleared(
      ["typecheck"],
      new Map([["typecheck", gate.blocked("ci red", "flaky")]]),
    );
    expect(blocked).toEqual({
      _tag: "Err",
      error: { kind: "gate-not-cleared", missing: ["typecheck"] },
    });

    const oneOfTwoSatisfied = buildCleared(
      ["typecheck", "test"],
      new Map([["typecheck", gate.satisfied(okReceipt)]]),
    );
    expect(oneOfTwoSatisfied).toEqual({
      _tag: "Err",
      error: { kind: "gate-not-cleared", missing: ["test"] },
    });
  });

  it("receipt cannot be constructed without a derivation", () => {
    // @ts-expect-error — no `derivation` field
    const illegal: Receipt = {
      id: "x",
      gate: "typecheck",
      commitSha: "a",
      spend: { kind: "none" },
      duration: duration.unknown(),
      proof: {},
    };
    expect(illegal).toBeTruthy();
  });

  it("receipt cannot be constructed without a spend", () => {
    // @ts-expect-error — no `spend` field
    const illegal: Receipt = {
      id: "x",
      gate: "typecheck",
      commitSha: "a",
      duration: duration.unknown(),
      derivation: derivation.human("a"),
      proof: {},
    };
    expect(illegal).toBeTruthy();
  });

  it("receipt cannot be constructed without a duration", () => {
    // @ts-expect-error — no `duration` field
    const illegal: Receipt = {
      id: "x",
      gate: "typecheck",
      commitSha: "a",
      spend: { kind: "none" },
      derivation: derivation.human("a"),
      proof: {},
    };
    expect(illegal).toBeTruthy();
  });

  it("mark cannot be constructed without a derivation", () => {
    // @ts-expect-error — no `derivation` field
    const illegal: Mark = { kind: "rooted", hunk: "src/gate.ts:1-10" };
    expect(illegal).toBeTruthy();
  });

  it("gate state outside the closed set of five cannot be constructed", () => {
    // @ts-expect-error — "approved" is not one of pending/satisfied/blocked/waived/superseded
    const illegal: Gate = { kind: "approved" };
    expect(illegal).toBeTruthy();
  });

  it("a waived gate cannot be constructed without both authority and because", () => {
    // @ts-expect-error — no `authority`
    const missingAuthority: Gate = {
      kind: "waived",
      because: "known flaky",
      receipt: okReceipt,
    };
    expect(missingAuthority).toBeTruthy();

    // @ts-expect-error — no `because`
    const missingBecause: Gate = {
      kind: "waived",
      authority: "Rodrigo Sasaki",
      receipt: okReceipt,
    };
    expect(missingBecause).toBeTruthy();
  });

  it("a superseded gate cannot be constructed without both authority and because", () => {
    // @ts-expect-error — no `because`
    const illegal: Gate = { kind: "superseded", authority: "Rodrigo Sasaki" };
    expect(illegal).toBeTruthy();
  });

  it("derivation kind outside gate, model or human cannot be constructed", () => {
    // @ts-expect-error — "heuristic" is not one of gate/model/human
    const illegal: Derivation = { kind: "heuristic" };
    expect(illegal).toBeTruthy();
  });

  it("a gate derivation cannot be constructed missing gate, version or runner", () => {
    // @ts-expect-error — no `version`, no `runner`
    const illegal: Derivation = { kind: "gate", gate: "typecheck" };
    expect(illegal).toBeTruthy();
  });

  it("a model derivation cannot be constructed missing model, promptId or lens", () => {
    // @ts-expect-error — no `promptId`, no `lens`
    const illegal: Derivation = { kind: "model", model: "claude-sonnet-5" };
    expect(illegal).toBeTruthy();
  });

  it("a human derivation cannot be constructed missing who", () => {
    // @ts-expect-error — no `who`
    const illegal: Derivation = { kind: "human" };
    expect(illegal).toBeTruthy();
  });

  it("spend outside the closed set of none, metered or local cannot be constructed", () => {
    // @ts-expect-error — "priced" is not one of none/metered/local
    const illegal: Spend = { kind: "priced", amountUsdMicros: 100 };
    expect(illegal).toBeTruthy();
  });

  it("held cannot be constructed without what it's waiting on, because or expiry", () => {
    // @ts-expect-error — no `on`, no `because`, no `expiry`
    const illegal: Outcome = { kind: "held", receipts: [] };
    expect(illegal).toBeTruthy();
  });

  it("held's gate-failure reason cannot be constructed without both failure and disposition", () => {
    // @ts-expect-error — no `failure`, no `disposition`
    const illegal: HeldOn = { kind: "gate-failure" };
    expect(illegal).toBeTruthy();
  });

  it("held-by-decision carries authority and the outer because, and cannot be built without either", () => {
    const held = outcome.held(
      [],
      heldOn.decision("Rodrigo Sasaki"),
      "waiting on a call only a person makes",
      30_000,
    );
    expect(held).toMatchObject({
      on: { kind: "decision", authority: "Rodrigo Sasaki" },
      because: "waiting on a call only a person makes",
    });

    // @ts-expect-error — no `authority`
    const missingAuthority: HeldOn = { kind: "decision" };
    expect(missingAuthority).toBeTruthy();

    // @ts-expect-error — no `because`
    const missingBecause: Outcome = {
      kind: "held",
      receipts: [],
      on: heldOn.decision("Rodrigo Sasaki"),
      expiry: 30_000,
    };
    expect(missingBecause).toBeTruthy();
  });

  it("failed cannot collapse failure, disposition and because into fewer than three fields", () => {
    // @ts-expect-error — no `disposition`, no `because`
    const illegalFailed: Outcome = {
      kind: "failed",
      receipts: [],
      failure: "typecheck failed",
    };
    expect(illegalFailed).toBeTruthy();
  });

  it("reset cannot be constructed without both authority and because", () => {
    // @ts-expect-error — no `authority`, no `because`
    const illegal: Outcome = { kind: "reset", receipts: [] };
    expect(illegal).toBeTruthy();
  });

  it("a disposition cannot appear on an outcome without its own because", () => {
    // @ts-expect-error — `disposition` present, `because` absent
    const illegal: Outcome = {
      kind: "failed",
      receipts: [],
      failure: "x",
      disposition: "retry",
    };
    expect(illegal).toBeTruthy();
  });

  it("an absent receipt (pending) and an empty-but-satisfied receipt stay distinct, constructible states", () => {
    const emptyProof: Receipt = { ...okReceipt, proof: {} };
    const absent = gate.pending();
    const present = gate.satisfied(emptyProof);
    expect(isGate(absent)).toBe(true);
    expect(isGate(present)).toBe(true);
    expect(absent.kind).toBe("pending");
    expect("receipt" in absent).toBe(false);
    expect(present.kind === "satisfied" && present.receipt.proof).toEqual({});
  });

  it("receipt identity is computed from content and gate, same content and gate, same receipt", async () => {
    const root = join(import.meta.dirname, "..");
    const paths = ["package.json"];
    const first = unwrap(
      await createReceipt(
        root,
        paths,
        "typecheck",
        "sha-a",
        { kind: "none" },
        duration.unknown(),
        derivation.human("a"),
        {},
      ),
    );
    const second = unwrap(
      await createReceipt(
        root,
        paths,
        "typecheck",
        "sha-b",
        { kind: "none" },
        duration.unknown(),
        derivation.human("a"),
        {},
      ),
    );
    expect(first.id).toBe(second.id);
    expect(first.id).toBe(unwrap(await receiptId(root, paths, "typecheck")));
    expect(isReceipt(first)).toBe(true);
  });

  it("a gate refuses to move out of waived or superseded", () => {
    const waived = gate.waived("Rodrigo Sasaki", "known flaky", okReceipt);
    const attempt = proposeGateMove(
      ["typecheck"],
      "typecheck",
      waived,
      gate.pending(),
    );
    expect(attempt).toEqual({
      _tag: "Err",
      error: { kind: "illegal-transition", from: "waived", to: "pending" },
    });

    const superseded = gate.superseded("Rodrigo Sasaki", "replaced");
    const secondAttempt = proposeGateMove(
      ["typecheck"],
      "typecheck",
      superseded,
      gate.satisfied(okReceipt),
    );
    expect(secondAttempt).toEqual({
      _tag: "Err",
      error: {
        kind: "illegal-transition",
        from: "superseded",
        to: "satisfied",
      },
    });
  });

  it("a gate move refuses a gate id outside the node's declared set", () => {
    const declared = ["typecheck", "test"];
    const attempt = proposeGateMove(
      declared,
      "lint",
      gate.pending(),
      gate.satisfied(okReceipt),
    );
    expect(attempt).toEqual({
      _tag: "Err",
      error: { kind: "undeclared-gate", gate: "lint", declared },
    });
  });

  it("a lease refuses to be renewed to an earlier or equal expiry", () => {
    const lease = createLease(node, "session-1", 30_000);
    expect(renewLease(lease, 30_000)).toEqual({
      _tag: "Err",
      error: { kind: "would-shorten", current: 30_000, proposed: 30_000 },
    });
    expect(renewLease(lease, 10_000)).toEqual({
      _tag: "Err",
      error: { kind: "would-shorten", current: 30_000, proposed: 10_000 },
    });
  });

  it("a lease cannot be constructed without a typed expiry", () => {
    // @ts-expect-error — no `expiry` field
    const illegal: import("../src/lease.js").Lease = {
      node,
      session: "session-1",
    };
    expect(illegal).toBeTruthy();
  });

  it("mark's gap arm still requires a derivation like every other arm", () => {
    const gap = mark.gap(derivation.human("a"), {
      term: "step",
      nearest: "gate",
      difference: "no verdict, only legality",
    });
    expect(gap.derivation).toEqual(derivation.human("a"));
  });
});
