import { unwrap } from "@phyxiusjs/fp";
import { loadGraphDocumentText, positionOf } from "face";
import {
  derivation,
  envelopeFor,
  fold,
  isLedgerEvent,
  isPersonSaid,
  type LedgerEvent,
  note,
  type PersonSaid,
  personSaid,
  sessionRuntime,
} from "ledger";
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

const question = note.question("2026-11-05T03:50:00Z", "Merge now?", ["yes", "no"]);
const now = Date.parse("2026-11-05T04:00:00Z");
const answered = personSaid({
  session: "s",
  by: "Rodrigo Sasaki",
  text: "yes",
  at: now,
  answers: question,
  because: "the walk reads",
});
const bare = personSaid({ session: "s", by: "Rodrigo Sasaki", text: "go on", at: now });

describe("isPersonSaid / parts/person-said.json (the event@v11 person-said)", () => {
  it("agree on a said with and without the question it answers", () => {
    for (const value of [answered, bare]) {
      expect(isPersonSaid(value)).toBe(true);
      expect(valid("parts/person-said", value)).toBe(true);
    }
  });

  it("agree that a said without who said it, or with a time that is not a number, is refused", () => {
    const { by: _by, ...withoutBy } = bare;
    const refused: readonly unknown[] = [withoutBy, { ...bare, at: "2026-11-05T04:00:00Z" }];
    for (const value of refused) {
      expect(isPersonSaid(value)).toBe(false);
      expect(valid("parts/person-said", value)).toBe(false);
    }
  });

  it("validate a person-said line at event@v11 and refuse it tagged event@v8", () => {
    const line: LedgerEvent = { kind: "person-said", session: "s", said: answered };
    expect(isLedgerEvent(envelopeFor(line))).toBe(true);
    expect(valid("event@v11", envelopeFor(line))).toBe(true);
    expect(valid("event@v8", { ...line, interlock: "event@v8" })).toBe(false);
  });

  it("validate a delivery recorded under a said's outbox identity at event@v11", () => {
    const delivery: LedgerEvent = {
      kind: "outbox-delivery-recorded",
      delivery: {
        id: answered.id,
        state: "uncertain",
        because: "agent_blocked: agent is blocked",
        derivation: derivation.gate("outbox", "runner@0", "interlock session say"),
      },
    };
    expect(valid("event@v11", envelopeFor(delivery))).toBe(true);
  });
});

describe("position@v3: heard and an open question's because, produced by the real positionOf", () => {
  const document = unwrap(
    loadGraphDocumentText(
      ["interlock: graph@v0", "id: g", "nodes:", "  - id: a", ""].join("\n"),
      "g.yaml",
    ),
  );
  const node = { graph: "g", id: "a" };
  const events = (said: PersonSaid, ...after: LedgerEvent[]): LedgerEvent[] => [
    {
      kind: "session-started",
      session: { id: "s", node, runtime: sessionRuntime.unknown() },
      brief: { graph: "g", node: "a", role: "worker", acceptance: "x", gates: [], scope: [] },
    },
    { kind: "lease-taken", node, session: "s", expiry: now + 60_000 },
    { kind: "note-appended", session: "s", note: question },
    { kind: "person-said", session: "s", said },
    ...after,
  ];

  it("validates an attempt that heard a person and whose question closed", () => {
    const position = positionOf(
      document,
      fold(
        events(answered, {
          kind: "outbox-delivery-recorded",
          delivery: {
            id: answered.id,
            state: "acknowledged",
            because: "the multiplexer took the words as a prompt",
            derivation: derivation.gate("outbox", "runner@0", "interlock session say"),
            acknowledgment: {
              interlock: "outbox-artifact@v0",
              sha256: "a".repeat(64),
              bytes: 2,
              ref: `outbox/acknowledgment/${"a".repeat(64)}.json`,
            },
          },
        }),
      ),
      "h",
      now,
      () => "blocked",
    );
    const attempt = position.nodes[0]?.attempts[0];
    expect(attempt?.heard).toEqual({ by: "Rodrigo Sasaki", text: "yes", at: now });
    expect(attempt?.asking?.asked).toBeNull();
    expect(valid("position@v3", position)).toBe(true);
  });

  it("validates an open question that says its answer's delivery is uncertain", () => {
    const position = positionOf(document, fold(events(answered)), "h", now, () => "blocked");
    const attempt = position.nodes[0]?.attempts[0];
    expect(attempt).not.toHaveProperty("heard");
    expect(attempt?.asking?.asked).toBe("Merge now?");
    expect(attempt?.asking?.because).toContain("is not known to have reached the pane");
    expect(valid("position@v3", position)).toBe(true);
  });
});
