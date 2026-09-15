import { derivation, duration, gate, type LedgerEvent, mark, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { evidenceOf, personEventsFor } from "../src/evidence.ts";

const verifier = derivation.gate("verifier-hunks", "verifier@0", "test");
const node = { graph: "0010-learning-transfer", id: "fresh-test-design" };

describe("verified-debrief evidence boundary", () => {
  it("selection: drops a partly verified multi-path decision before it creates a scope gap", () => {
    const evidence = evidenceOf({
      derivation: { kind: "agent", runtime: "test-runtime", model: "test-model" },
      decisions: [
        {
          decision: {
            id: "dropped",
            what: "combined two changes",
            because: "the changes were related",
            restsOn: [],
            hunks: [
              "packages/substrate/src/evidence.ts:74-97",
              "packages/ledger/src/mark.ts:19-37",
            ],
          },
          marks: [
            mark.rooted(verifier, "packages/substrate/src/evidence.ts:74-97"),
            mark.unrooted(verifier, "packages/ledger/src/mark.ts was not changed"),
          ],
        },
        {
          decision: {
            id: "kept",
            what: "kept verification separate from projection",
            because: "projection must retain only verified claims",
            restsOn: [],
            hunks: ["packages/substrate/src/evidence.ts:74-97"],
          },
          marks: [mark.rooted(verifier, "packages/substrate/src/evidence.ts:74-97")],
        },
      ],
      discoveries: [],
      receipts: [],
      personEvents: [],
      harnessAuthorities: new Set(),
    });

    expect(evidence).toEqual({
      items: [
        {
          kind: "decision",
          statement: "kept verification separate from projection",
          because: "projection must retain only verified claims",
          scope: { kind: "path", path: "packages/substrate/src/evidence.ts" },
          standing: "hypothesis",
          derivation: "agent:test-runtime:test-model",
        },
      ],
      gaps: [],
    });
  });

  it("provenance: projects the debrief agent rather than the verifier that rooted it", () => {
    const evidence = evidenceOf({
      derivation: { kind: "agent", runtime: "test-runtime", model: "test-model" },
      decisions: [
        {
          decision: {
            id: "provenance",
            what: "kept agent provenance on the projected claim",
            because: "verification and authorship are separate derivations",
            restsOn: [],
            hunks: ["packages/substrate/src/evidence.ts:74-97"],
          },
          marks: [mark.rooted(verifier, "packages/substrate/src/evidence.ts:74-97")],
        },
      ],
      discoveries: [],
      receipts: [],
      personEvents: [],
      harnessAuthorities: new Set(),
    });

    expect(evidence.items).toEqual([
      expect.objectContaining({
        derivation: "agent:test-runtime:test-model",
        standing: "hypothesis",
      }),
    ]);
    expect(evidence.items[0]?.derivation).not.toBe("gate:verifier-hunks:verifier@0:test");
  });

  it("standing: projects only this node's events and the graph's approved human gate", () => {
    const approvedReceipt = {
      id: "approved-1",
      gate: "approved",
      commitSha: "a".repeat(40),
      spend: spend.none(),
      duration: duration.unknown(),
      derivation: derivation.human("Rodrigo Sasaki"),
      proof: { because: "approved this graph" },
    };
    const events: readonly LedgerEvent[] = [
      {
        kind: "gate-moved",
        node: { graph: node.graph, id: "source-diagnosis" },
        gate: "reviewed",
        to: gate.satisfied(approvedReceipt),
      },
      {
        kind: "gate-moved",
        node: { graph: node.graph, id: node.graph },
        gate: "approved",
        to: gate.satisfied(approvedReceipt),
      },
      {
        kind: "gate-moved",
        node: { graph: node.graph, id: node.graph },
        gate: "release",
        to: gate.satisfied(approvedReceipt),
      },
    ];
    const personEvents = personEventsFor(node, events);

    expect(personEvents).toEqual([events[1]]);
    expect(
      evidenceOf({
        derivation: { kind: "agent", runtime: "test-runtime", model: "test-model" },
        decisions: [],
        discoveries: [],
        receipts: [],
        personEvents,
        harnessAuthorities: new Set(),
      }),
    ).toEqual({
      items: [
        {
          kind: "decision",
          statement: "approved gate approved",
          because: "approved this graph",
          standing: "professed",
          derivation: "human:Rodrigo Sasaki",
        },
      ],
      gaps: [],
    });
  });
});
