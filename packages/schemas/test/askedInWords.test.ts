import { unwrap } from "@phyxiusjs/fp";
import { loadGraphDocumentText, positionOf } from "face";
import { fold, type LedgerEvent, note, sessionRuntime } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();
const schemaId = (tag: string): string =>
  `https://github.com/rodrigopsasaki/interlock/schemas/${tag}.json`;

function valid(tag: string, value: unknown): boolean {
  const validate = registry.ajv.getSchema(schemaId(tag));
  if (validate === undefined) throw new Error(`${tag} schema is unavailable`);
  return validate(value) === true;
}

const notesWith = (entry: Record<string, unknown>): unknown => ({
  interlock: "notes@v0",
  node: "n",
  entries: [entry],
});

describe("notes@v0: question", () => {
  it("accepts a question with and without options, beside the older kinds", () => {
    expect(valid("notes@v0", notesWith({ kind: "question", at: "t", asked: "Merge now?" }))).toBe(
      true,
    );
    expect(
      valid(
        "notes@v0",
        notesWith({ kind: "question", at: "t", asked: "Merge now?", options: ["yes", "no"] }),
      ),
    ).toBe(true);
    expect(
      valid("notes@v0", notesWith({ kind: "surprise", at: "t", expected: "a", observed: "b" })),
    ).toBe(true);
  });

  it("refuses a question without its words or with options that are not a list", () => {
    expect(valid("notes@v0", notesWith({ kind: "question", at: "t" }))).toBe(false);
    expect(
      valid("notes@v0", notesWith({ kind: "question", at: "t", asked: "x", options: "yes" })),
    ).toBe(false);
  });
});

describe("position@v3: asking, produced by the real positionOf", () => {
  const document = unwrap(
    loadGraphDocumentText(
      ["interlock: graph@v0", "id: g", "nodes:", "  - id: a", ""].join("\n"),
      "g.yaml",
    ),
  );
  const node = { graph: "g", id: "a" };
  const now = Date.parse("2026-11-05T02:00:00Z");
  const events = (...after: LedgerEvent[]): LedgerEvent[] => [
    {
      kind: "session-started",
      session: { id: "s", node, runtime: sessionRuntime.unknown() },
      brief: { graph: "g", node: "a", role: "worker", acceptance: "x", gates: [], scope: [] },
    },
    { kind: "lease-taken", node, session: "s", expiry: now + 60_000 },
    ...after,
  ];

  it("validates asking with the session's words and with null and a because", () => {
    const asked = positionOf(
      document,
      fold(
        events({
          kind: "note-appended",
          session: "s",
          note: note.question("2026-11-05T01:00:00Z", "Merge now?", ["yes", "no"]),
        }),
      ),
      "h",
      now,
      () => "blocked",
    );
    const silent = positionOf(document, fold(events()), "h", now, () => "blocked");
    expect(asked.nodes[0]?.attempts[0]?.asking?.asked).toBe("Merge now?");
    expect(silent.nodes[0]?.attempts[0]?.asking?.asked).toBeNull();
    expect(valid("position@v3", asked)).toBe(true);
    expect(valid("position@v3", silent)).toBe(true);
  });

  it("refuses asking on an attempt that is not blocked", () => {
    const position = positionOf(
      document,
      fold(
        events({
          kind: "note-appended",
          session: "s",
          note: note.question("2026-11-05T01:00:00Z", "Merge now?"),
        }),
      ),
      "h",
      now,
      () => "blocked",
    );
    const [first] = position.nodes;
    const [attempt] = first?.attempts ?? [];
    if (first === undefined || attempt === undefined) throw new Error("no attempt");
    expect(
      valid("position@v3", {
        ...position,
        nodes: [{ ...first, attempts: [{ ...attempt, agentStatus: "working" }] }],
      }),
    ).toBe(false);
  });
});
