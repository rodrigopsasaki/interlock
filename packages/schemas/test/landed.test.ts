import type { GraphDocument, Landed, LandedReader, Position } from "face";
import { positionOf } from "face";
import { derivation, duration, fold, type LedgerEvent, type Receipt, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry, validatorFor } from "../src/registry.ts";
import { judgeValue } from "../src/validate.ts";

const MAIN = "1111111111111111111111111111111111111111";
const HEAD_A = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const HEAD_B = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";
const BASE = "0000000000000000000000000000000000000000";
const FIRST = "3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c";
const SECOND = "4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d";
const UNDO_FIRST = "5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e";
const UNDO_SECOND = "6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f";

const partly: Landed = {
  kind: "partly-reverted-on-main",
  main: MAIN,
  head: HEAD_B,
  reverted: [FIRST, SECOND],
  revertedBy: { [FIRST]: UNDO_FIRST, [SECOND]: UNDO_SECOND },
};

const document: GraphDocument = {
  id: "g",
  gates: [],
  nodes: [
    { id: "a", dependsOn: [], gates: [] },
    { id: "b", dependsOn: ["a"], gates: [] },
  ],
};

function headReceipt(sha: string): Receipt {
  return {
    id: `receipt-${sha}`,
    gate: "typecheck",
    commitSha: sha,
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: derivation.gate("typecheck", "1", "runner"),
    proof: {},
  };
}

function cleared(id: string, sha: string): LedgerEvent[] {
  const node = { graph: "g", id };
  return [
    { kind: "node-created", node },
    {
      kind: "session-started",
      session: { id: `session-${id}`, node, runtime: "unknown" },
      brief: { graph: "g", node: id, role: "worker", acceptance: "x", gates: [], scope: [] },
      graphBaseSha: BASE,
    },
    { kind: "lease-taken", node, session: `session-${id}`, expiry: Date.now() + 60_000 },
    { kind: "outcome-set", node, outcome: { kind: "cleared", receipts: [headReceipt(sha)] } },
  ];
}

const bothCleared = fold([...cleared("a", HEAD_A), ...cleared("b", HEAD_B)]);

function readWith(landedFor: (head: string) => Landed): Position {
  const reader: LandedReader = (head) =>
    head.kind === "unknown" ? { kind: "unknown", because: head.because } : landedFor(head.head);
  return positionOf(document, bothCleared, "content-hash", Date.now(), undefined, reader);
}

const registry = buildRegistry();
const v1 = validatorFor(registry, "position@v1");
const v2 = validatorFor(registry, "position@v2");

function validV1(value: unknown): boolean {
  if (v1 === undefined) throw new Error("no position@v1 validator");
  return v1(value) === true;
}

function validV2(value: unknown): boolean {
  if (v2 === undefined) throw new Error("no position@v2 validator");
  return v2(value) === true;
}

const landedKinds: Array<[Landed["kind"], (head: string) => Landed]> = [
  ["on-main", (head) => ({ kind: "on-main", main: MAIN, head, by: "squash" })],
  ["not-on-main", (head) => ({ kind: "not-on-main", main: MAIN, head })],
  [
    "reverted-on-main",
    (head) => ({ kind: "reverted-on-main", main: MAIN, head, revertedBy: UNDO_FIRST }),
  ],
  ["partly-reverted-on-main", (head) => ({ ...partly, head })],
  ["unknown", () => ({ kind: "unknown", because: "main could not be read" })],
];

describe("landed: code-produced position@v2", () => {
  for (const [kind, landedFor] of landedKinds) {
    it(`validates a latest position whose nodes land ${kind}`, () => {
      const position = readWith(landedFor);
      expect(position.interlock).toBe("position@v2");
      expect(position.nodes.map((node) => node.landed?.kind)).toEqual([kind, kind]);
      expect(validV2(position), JSON.stringify(v2?.errors)).toBe(true);
    });
  }

  it("hands the reader each cleared head with its session's base", () => {
    const seen: unknown[] = [];
    positionOf(document, bothCleared, "content-hash", Date.now(), undefined, (head) => {
      seen.push(head);
      return { kind: "unknown", because: "probe" };
    });
    expect(seen).toEqual([
      { kind: "known", head: HEAD_A, base: BASE },
      { kind: "known", head: HEAD_B, base: BASE },
    ]);
  });

  it("carries no landed key on nodes that are not cleared, and still validates", () => {
    const position = positionOf(
      document,
      fold([{ kind: "node-created", node: { graph: "g", id: "a" } }]),
      "content-hash",
      Date.now(),
      undefined,
      () => partly,
    );
    for (const node of position.nodes) expect(Object.hasOwn(node, "landed")).toBe(false);
    expect(validV2(position), JSON.stringify(v2?.errors)).toBe(true);
  });
});

describe("landed: done", () => {
  it("is true when every node is cleared and on main", () => {
    const position = readWith((head) => ({ kind: "on-main", main: MAIN, head, by: "ancestry" }));
    expect(position.done).toBe(true);
  });

  it("is false when every node is cleared but one is partly reverted on main", () => {
    const position = readWith((head) =>
      head === HEAD_B ? { ...partly, head } : { kind: "on-main", main: MAIN, head, by: "ancestry" },
    );
    expect(position.nodes.every((node) => node.state.kind === "outcome")).toBe(true);
    expect(position.done).toBe(false);
  });
});

function v1Fixture(landed?: object) {
  return {
    interlock: "position@v1",
    graph: "g",
    approval: "approved",
    line: { voice: "observed", text: "a cleared, on main" },
    nodes: [
      {
        id: "a",
        dependsOn: [],
        state: { kind: "outcome", outcome: { kind: "cleared", receipts: [] } },
        gates: [],
        attempts: [],
        float: { kind: "unknown", because: "a: no outcome yet" },
        ...(landed === undefined ? {} : { landed }),
        notes: [],
      },
    ],
    criticalPath: ["a"],
    done: false,
  };
}

const retainedV1 = {
  "no landed": v1Fixture(),
  "on-main": v1Fixture({ kind: "on-main", main: "main", head: HEAD_A, by: "patch" }),
  "not-on-main": v1Fixture({ kind: "not-on-main", main: "main", head: HEAD_A }),
  "reverted-on-main": v1Fixture({
    kind: "reverted-on-main",
    main: "main",
    head: HEAD_A,
    revertedBy: UNDO_FIRST,
  }),
  unknown: v1Fixture({ kind: "unknown", because: "main could not be read" }),
};

describe("landed: retained position@v1", () => {
  for (const [name, fixture] of Object.entries(retainedV1)) {
    it(`still validates a fixed position@v1 with ${name}`, () => {
      expect(validV1(fixture), JSON.stringify(v1?.errors)).toBe(true);
    });
  }

  it("refuses partly-reverted-on-main under position@v1", () => {
    expect(validV1(v1Fixture(partly))).toBe(false);
  });

  it("accepts a fixed position@v1 and a code-produced position@v2 inside positions@v0", () => {
    const produced = readWith((head) => ({ ...partly, head }));
    for (const position of [retainedV1["reverted-on-main"], produced]) {
      const read = {
        interlock: "positions@v0",
        repositories: [
          {
            asked: "/repo",
            state: "found",
            root: "/repo",
            origin: { state: "unidentified", because: "no origin remote" },
            journal: { state: "read" },
            graphs: [{ graph: "g", state: "read", position }],
            live: [],
          },
        ],
      };
      expect(judgeValue(registry, read)).toEqual({ kind: "valid", tag: "positions@v0" });
    }
  });
});

describe("landed: malformed partly-reverted-on-main evidence under position@v2", () => {
  const { reverted: _reverted, ...withoutReverted } = partly;
  const { revertedBy: _revertedBy, ...withoutRevertedBy } = partly;
  const malformed: Record<string, object> = {
    "missing reverted": withoutReverted,
    "missing revertedBy": withoutRevertedBy,
    "empty reverted": { ...partly, reverted: [] },
    "non-array reverted": { ...partly, reverted: FIRST },
    "abbreviated SHA in reverted": { ...partly, reverted: [FIRST.slice(0, 12)] },
    "non-hex SHA in reverted": { ...partly, reverted: ["z".repeat(40)] },
    "non-SHA revertedBy value": { ...partly, revertedBy: { [FIRST]: "revert of first" } },
    "revertedBy as an array": { ...partly, revertedBy: [UNDO_FIRST] },
    "revertedBy as a string": { ...partly, revertedBy: UNDO_FIRST },
    "an unknown property": { ...partly, undoneAt: MAIN },
  };

  const produced = readWith((head) => ({ ...partly, head }));

  it("accepts the well-formed evidence the malformed cases start from", () => {
    expect(validV2(produced), JSON.stringify(v2?.errors)).toBe(true);
  });

  for (const [name, landed] of Object.entries(malformed)) {
    it(`refuses ${name}`, () => {
      const position = {
        ...produced,
        nodes: produced.nodes.map((node) => ({ ...node, landed })),
      };
      expect(validV2(position)).toBe(false);
    });
  }
});
