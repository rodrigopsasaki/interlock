import type { Item } from "debrief";
import { derivation, duration, mark, note, type Receipt, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const BASE = "https://github.com/rodrigopsasaki/interlock/schemas/substrate@v1";

const registry = buildRegistry();

function schemaFor(name: string) {
  const validate = registry.ajv.getSchema(`${BASE}/${name}.json`);
  if (validate === undefined) throw new Error(`no substrate schema for ${name}`);
  return validate;
}

const convention: Item = {
  kind: "convention",
  statement: "Conventional Commits, why-subjects and bodies",
  scope: { kind: "repository" },
  standing: "ratified",
  derivation: "substrate@v1 context",
};

const decisionItem: Item = {
  kind: "decision",
  statement: "ajv was chosen as the JSON Schema validator over a hand-rolled one",
  because: "draft 2020-12 has easy-to-get-wrong semantics",
  standing: "observed",
  derivation: "substrate@v1 consult",
};

const okReceipt: Receipt = {
  id: "receipt-typecheck",
  gate: "typecheck",
  commitSha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1.0.0", "runner"),
  proof: {},
};

const okDebrief = {
  interlock: "debrief@v2",
  graph: "0002-shapes",
  node: "substrate-protocol",
  role: "worker",
  graph_base_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  session_start_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  head_sha: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
  derivation: {
    kind: "agent",
    runtime: "claude-code",
    model: "claude-sonnet-5",
  },
  discoveries: [],
  decisions: [
    {
      id: "d1",
      what: "used ajv for schema validation",
      because: "audited, widely used, draft-2020-12 aware",
      rests_on: [],
      hunks: ["packages/schemas/src/registry.ts:1-10"],
    },
  ],
  gates_run_by_agent: [],
  open: [],
};

const okNotes = {
  interlock: "notes@v0",
  node: "substrate-protocol",
  entries: [
    note.choice(
      "2026-09-11T12:00:00Z",
      "reused item@v1's decision kind for consult's prior decisions",
      "decision is already an item kind; no parallel shape is needed",
    ),
  ],
};

const okBrief = {
  interlock: "brief@v1",
  graph: "0002-shapes",
  node: "substrate-protocol",
  role: "worker",
  gates: [{ id: "typecheck", kind: "command", run: "pnpm typecheck" }],
  scope: ["packages/schemas/src"],
  substrate: { address: "none" },
};

interface VerbCase {
  readonly verb: string;
  readonly request: unknown;
  readonly response: unknown;
}

const cases: readonly VerbCase[] = [
  {
    verb: "context",
    request: {
      node: { graph: "0002-shapes", id: "substrate-protocol" },
      scope: ["schemas/substrate"],
      role: "worker",
    },
    response: { items: [convention], vocabulary: "1" },
  },
  {
    verb: "absorb",
    request: { debrief: okDebrief, notes: okNotes, receipts: [okReceipt] },
    response: {
      decisions_absorbed: ["d1"],
      discoveries: [],
      gaps: [
        {
          term: "step",
          nearest: "gate",
          difference: "no verdict, only legality",
        },
      ],
    },
  },
  {
    verb: "consult",
    request: {
      intent: "add a capabilities response schema",
      scope: ["schemas/substrate"],
    },
    response: { items: [decisionItem] },
  },
  {
    verb: "query",
    request: {
      question: "does item@v1 carry an id?",
      scope: ["schemas/item@v1.json"],
    },
    response: { items: [convention] },
  },
  {
    verb: "why",
    request: { ref: "slice-item-0" },
    response: {
      chain: [
        mark.rooted(derivation.human("Rodrigo Sasaki"), "docs/design/0003-substrate.md:62-73"),
      ],
    },
  },
  {
    verb: "note",
    request: {
      session: "session-1",
      note: note.choice("2026-09-11T12:00:00Z", "chose x", "because y"),
    },
    response: {
      accepted: true,
      derivation: derivation.human("Rodrigo Sasaki"),
    },
  },
  {
    verb: "open",
    request: { session: "session-1", brief: okBrief },
    response: { accepted: true },
  },
  {
    verb: "close",
    request: { session: "session-1", reason: "debrief filed" },
    response: { accepted: true },
  },
  {
    verb: "propose",
    request: {
      rule: "always name the reference implementation once",
      because: "the wall",
    },
    response: { handle: "proposal-1" },
  },
  {
    verb: "ratify",
    request: { handle: "proposal-1", who: "Rodrigo Sasaki" },
    response: { item: { ...convention, standing: "ratified" } },
  },
  {
    verb: "contest",
    request: {
      ref: "slice-item-0",
      stance: "disagree",
      because: "no longer true",
    },
    response: { recorded: true },
  },
  {
    verb: "judge",
    request: { diff: "diff --git a/x b/x\n", brief: okBrief },
    response: okReceipt,
  },
];

describe("corpus: substrate@v1, request and response per verb", () => {
  for (const { verb, request, response } of cases) {
    it(`${verb}.request validates a real request`, () => {
      const validate = schemaFor(`${verb}.request`);
      expect(validate(request), JSON.stringify(validate.errors)).toBe(true);
    });
    it(`${verb}.response validates a real response`, () => {
      const validate = schemaFor(`${verb}.response`);
      expect(validate(response), JSON.stringify(validate.errors)).toBe(true);
    });
  }

  it("capabilities.response validates a real declaration", () => {
    const validate = schemaFor("capabilities.response");
    const value = { capabilities: ["consult", "query", "why", "judge"] };
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("refuses a capability outside the declared ten", () => {
    const validate = schemaFor("capabilities.response");
    const value = { capabilities: ["absorb"] };
    expect(validate(value)).toBe(false);
  });

  it("the item@v1 fixture validates as context's own slice item", () => {
    const validate = registry.ajv.getSchema(
      "https://github.com/rodrigopsasaki/interlock/schemas/item@v1.json",
    );
    expect(validate?.(convention), JSON.stringify(validate?.errors)).toBe(true);
  });

  it("refuses a context.response item with no derivation", () => {
    const validate = schemaFor("context.response");
    const { derivation: _drop, ...itemMissingDerivation } = convention;
    const value = { items: [itemMissingDerivation], vocabulary: "1" };
    expect(validate(value)).toBe(false);
  });

  it("refuses a query.response item with no derivation", () => {
    const validate = schemaFor("query.response");
    const { derivation: _drop, ...itemMissingDerivation } = convention;
    const value = { items: [itemMissingDerivation] };
    expect(validate(value)).toBe(false);
  });

  it("refuses absorb.request carrying a receipt with no derivation", () => {
    const validate = schemaFor("absorb.request");
    const { derivation: _drop, ...receiptMissingDerivation } = okReceipt;
    const value = {
      debrief: okDebrief,
      notes: okNotes,
      receipts: [receiptMissingDerivation],
    };
    expect(validate(value)).toBe(false);
  });

  it("validates absorb.request carrying the harness's translated evidence, items and gaps", () => {
    const validate = schemaFor("absorb.request");
    const value = {
      debrief: okDebrief,
      notes: okNotes,
      receipts: [okReceipt],
      items: [decisionItem],
      gaps: [
        {
          term: "step",
          nearest: "gate",
          difference: "no verdict, only legality",
        },
      ],
    };
    expect(validate(value), JSON.stringify(validate.errors)).toBe(true);
  });

  it("refuses judge.response with no derivation, since a verdict is a receipt", () => {
    const validate = schemaFor("judge.response");
    const { derivation: _drop, ...receiptMissingDerivation } = okReceipt;
    expect(validate(receiptMissingDerivation)).toBe(false);
  });

  it("refuses why.response carrying a mark with no derivation", () => {
    const validate = schemaFor("why.response");
    const value = { chain: [{ kind: "rooted", hunk: "x:1-2" }] };
    expect(validate(value)).toBe(false);
  });
});
