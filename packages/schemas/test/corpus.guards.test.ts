import {
  derivation,
  duration,
  envelopeFor,
  gate,
  heldOn,
  isBrief,
  isDebrief,
  isDerivation,
  isGate,
  isLease,
  isLedgerEvent,
  isMark,
  isNote,
  isOutcome,
  mark,
  note,
  outcome,
  spend,
  type Brief,
  type Debrief,
  type Derivation,
  type Gate,
  type LedgerEvent,
  type Lease,
  type Mark,
  type Note,
  type Outcome,
  type Receipt,
} from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();
const BASE = "https://github.com/rodrigopsasaki/interlock/schemas/parts";

function validatesAgainstPart(name: string, value: unknown): boolean {
  const validate = registry.ajv.getSchema(`${BASE}/${name}.json`);
  if (validate === undefined) throw new Error(`no part schema for ${name}`);
  return validate(value) === true;
}

const okReceipt: Receipt = {
  id: "abc123",
  gate: "typecheck",
  commitSha: "deadbeef",
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1", "runner"),
  proof: {},
};

describe("corpus: the ledger's guards and this node's schemas agree", () => {
  describe("isReceipt / parts/receipt.json", () => {
    it("agree on a real receipt", () => {
      expect(validatesAgainstPart("receipt", okReceipt)).toBe(true);
    });
    it("agree on a receipt missing derivation", () => {
      const { derivation: _drop, ...broken } = okReceipt;
      expect(validatesAgainstPart("receipt", broken)).toBe(false);
    });
    it("agree on a receipt missing duration", () => {
      const { duration: _drop, ...broken } = okReceipt;
      expect(validatesAgainstPart("receipt", broken)).toBe(false);
    });
  });

  describe("isDerivation / parts/derivation.json", () => {
    const cases: readonly [Derivation, boolean][] = [
      [derivation.gate("typecheck", "1.0.0", "runner-command-gate"), true],
      [
        derivation.model(
          "claude-sonnet-5",
          "verifier:hunk@v1",
          "verifier:lens@v1",
        ),
        true,
      ],
      [derivation.human("Rodrigo Sasaki"), true],
    ];
    for (const [value, expected] of cases) {
      it(`agree on ${JSON.stringify(value)}`, () => {
        expect(isDerivation(value)).toBe(expected);
        expect(validatesAgainstPart("derivation", value)).toBe(expected);
      });
    }
    it("agree that an unknown kind is refused", () => {
      const value = { kind: "vendor" };
      expect(isDerivation(value)).toBe(false);
      expect(validatesAgainstPart("derivation", value)).toBe(false);
    });
  });

  describe("isMark / parts/mark.json", () => {
    it("agree on a rooted mark", () => {
      const value: Mark = mark.rooted(
        derivation.human("a"),
        "src/gate.ts:1-10",
      );
      expect(isMark(value)).toBe(true);
      expect(validatesAgainstPart("mark", value)).toBe(true);
    });
    it("agree on a gap mark", () => {
      const value: Mark = mark.gap(derivation.human("a"), {
        term: "step",
        nearest: "gate",
        difference: "no verdict, only legality",
      });
      expect(isMark(value)).toBe(true);
      expect(validatesAgainstPart("mark", value)).toBe(true);
    });
    it("agree that a mark missing derivation is refused", () => {
      const value = { kind: "rooted", hunk: "src/gate.ts:1-10" };
      expect(isMark(value)).toBe(false);
      expect(validatesAgainstPart("mark", value)).toBe(false);
    });
  });

  describe("isGate / parts/gate.json", () => {
    const cases: readonly [Gate, boolean][] = [
      [gate.pending(), true],
      [gate.satisfied(okReceipt), true],
      [gate.blocked("ci is red", "flaky network"), true],
      [gate.waived("Rodrigo Sasaki", "known flaky suite", okReceipt), true],
      [gate.superseded("Rodrigo Sasaki", "replaced by a stricter gate"), true],
    ];
    for (const [value, expected] of cases) {
      it(`agree on kind ${value.kind}`, () => {
        expect(isGate(value)).toBe(expected);
        expect(validatesAgainstPart("gate", value)).toBe(expected);
      });
    }
    it("agree that an out-of-union kind is refused", () => {
      const value = { kind: "approved" };
      expect(isGate(value)).toBe(false);
      expect(validatesAgainstPart("gate", value)).toBe(false);
    });
    it("agree that waived without authority is refused", () => {
      const value = {
        kind: "waived",
        because: "known flaky",
        receipt: okReceipt,
      };
      expect(isGate(value)).toBe(false);
      expect(validatesAgainstPart("gate", value)).toBe(false);
    });
  });

  describe("isOutcome / parts/outcome.json", () => {
    const cases: readonly [Outcome, boolean][] = [
      [{ kind: "cleared", receipts: [] }, true],
      [
        outcome.held(
          [],
          heldOn.gateFailure("typecheck failed", "repair"),
          "a real type error, not flaky",
          30000,
        ),
        true,
      ],
      [
        outcome.held(
          [],
          heldOn.uncommittedWork(4),
          "4 uncommitted path(s) in the worktree; gates judge commits only",
          30000,
        ),
        true,
      ],
      [outcome.reset([], "Rodrigo Sasaki", "flaky suite, re-running"), true],
      [
        outcome.failed(
          [],
          "typecheck failed",
          "terminal-failure",
          "budget spent",
        ),
        true,
      ],
      [
        outcome.cancelled([], "Rodrigo Sasaki", "acceptance re-versioned"),
        true,
      ],
    ];
    for (const [value, expected] of cases) {
      it(`agree on kind ${value.kind}`, () => {
        expect(isOutcome(value)).toBe(expected);
        expect(validatesAgainstPart("outcome", value)).toBe(expected);
      });
    }
    it("agree that held missing because/expiry is refused", () => {
      const value = { kind: "held", receipts: [] };
      expect(isOutcome(value)).toBe(false);
      expect(validatesAgainstPart("outcome", value)).toBe(false);
    });
    it("agree that reset missing authority/because is refused", () => {
      const value = { kind: "reset", receipts: [] };
      expect(isOutcome(value)).toBe(false);
      expect(validatesAgainstPart("outcome", value)).toBe(false);
    });
  });

  describe("isLease / parts/lease.json", () => {
    it("agree on a real lease", () => {
      const value: Lease = {
        node: { graph: "0001-bootstrap", id: "ledger" },
        session: "session-1",
        expiry: 30000,
      };
      expect(isLease(value)).toBe(true);
      expect(validatesAgainstPart("lease", value)).toBe(true);
    });
    it("agree that a lease missing expiry is refused", () => {
      const value = {
        node: { graph: "0001-bootstrap", id: "ledger" },
        session: "session-1",
      };
      expect(isLease(value)).toBe(false);
      expect(validatesAgainstPart("lease", value)).toBe(false);
    });
  });

  describe("isNote / parts/note.json", () => {
    const cases: readonly [Note, boolean][] = [
      [
        note.choice(
          "2026-09-09T12:00:00Z",
          "used @phyxiusjs/fp for refusals",
          "the reference already leans on it",
        ),
        true,
      ],
      [
        note.choice(
          "2026-09-09T12:00:00Z",
          "kept spend on the receipt",
          "matches the acceptance",
          ["a separate spend table"],
        ),
        true,
      ],
      [
        note.surprise(
          "2026-09-09T12:00:00Z",
          "pnpm test --filter ledger -- --grep replay to work",
          "pnpm has no --filter after the script name",
        ),
        true,
      ],
    ];
    for (const [value, expected] of cases) {
      it(`agree on kind ${value.kind}`, () => {
        expect(isNote(value)).toBe(expected);
        expect(validatesAgainstPart("note", value)).toBe(expected);
      });
    }
    it("agree that an out-of-union kind is refused", () => {
      const value = { kind: "observation", at: "now" };
      expect(isNote(value)).toBe(false);
      expect(validatesAgainstPart("note", value)).toBe(false);
    });
    it("agree that rejected as a non-array string is refused on the strict, event-embedded shape", () => {
      const value = {
        kind: "choice",
        at: "2026-09-09T12:00:00Z",
        chose: "x",
        because: "y",
        rejected: "not a list",
      };
      expect(isNote(value)).toBe(false);
      expect(validatesAgainstPart("note", value)).toBe(false);
    });
  });

  describe("isBrief / parts/session-brief.json (the ledger's own reduced Brief)", () => {
    it("agree on a real reduced brief", () => {
      const value: Brief = {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        acceptance: "the ledger as a Phyxius journal",
        gates: ["replay", "unrepresentable"],
        scope: ["packages/ledger/src"],
      };
      expect(isBrief(value)).toBe(true);
      expect(validatesAgainstPart("session-brief", value)).toBe(true);
    });
    it("agree that gates as a bare string, not a list, is refused", () => {
      const value = {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        acceptance: "x",
        gates: "replay",
        scope: [],
      };
      expect(isBrief(value)).toBe(false);
      expect(validatesAgainstPart("session-brief", value)).toBe(false);
    });
  });

  describe("isDebrief / parts/debrief-event.json (the ledger's own full Debrief)", () => {
    const minimal: Debrief = {
      graph: "0001-bootstrap",
      node: "ledger",
      role: "worker",
      graphBaseSha: "deadbeef",
      sessionStartSha: "deadbeef",
      headSha: "deadbeef",
      derivation: {
        kind: "agent",
        runtime: "claude-code",
        model: "claude-sonnet-5",
      },
      discoveries: [],
      decisions: [],
      gatesRunByAgent: [],
      open: [],
    };
    it("agree on the minimal, empty-arrays shape", () => {
      expect(isDebrief(minimal)).toBe(true);
      expect(validatesAgainstPart("debrief-event", minimal)).toBe(true);
    });
    it("agree that a v1-era partial (missing graphBaseSha etc.) is refused", () => {
      const value = {
        graph: "0001-bootstrap",
        node: "ledger",
        role: "worker",
        headSha: "deadbeef",
        discoveries: [],
        decisions: [],
        open: [],
      };
      expect(isDebrief(value)).toBe(false);
      expect(validatesAgainstPart("debrief-event", value)).toBe(false);
    });
  });

  describe("isLedgerEvent / the current event schema (event@v4)", () => {
    const nodeCreated: LedgerEvent = {
      kind: "node-created",
      node: { graph: "0001-bootstrap", id: "ledger" },
    };
    it("agree on a node-created envelope", () => {
      const envelope = envelopeFor(nodeCreated);
      expect(isLedgerEvent(envelope)).toBe(true);
      const validate = registry.ajv.getSchema(
        "https://github.com/rodrigopsasaki/interlock/schemas/event@v4.json",
      );
      expect(validate?.(envelope)).toBe(true);
    });
    it("agree that a session-started envelope with no graphBaseSha is still valid", () => {
      const envelope = envelopeFor({
        kind: "session-started",
        session: {
          id: "session-1",
          node: { graph: "0001-bootstrap", id: "ledger" },
        },
        brief: {
          graph: "0001-bootstrap",
          node: "ledger",
          role: "worker",
          acceptance: "x",
          gates: [],
          scope: [],
        },
      });
      expect(isLedgerEvent(envelope)).toBe(true);
      const validate = registry.ajv.getSchema(
        "https://github.com/rodrigopsasaki/interlock/schemas/event@v4.json",
      );
      expect(validate?.(envelope)).toBe(true);
    });
    it("agree that an unknown kind is refused", () => {
      const envelope = { interlock: "event@v4", kind: "unknown-thing" };
      expect(isLedgerEvent(envelope)).toBe(false);
      const validate = registry.ajv.getSchema(
        "https://github.com/rodrigopsasaki/interlock/schemas/event@v4.json",
      );
      expect(validate?.(envelope)).toBe(false);
    });
  });
});
