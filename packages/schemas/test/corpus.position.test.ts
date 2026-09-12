import type { GraphDocument } from "face";
import { positionOf } from "face";
import { derivation, duration, fold, gate, type Receipt, spend } from "ledger";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const okReceipt: Receipt = {
  id: "receipt-typecheck",
  gate: "typecheck",
  commitSha: "deadbeef",
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "1", "runner"),
  proof: {},
};

const document: GraphDocument = {
  id: "g",
  gates: [],
  nodes: [
    { id: "a", dependsOn: [], gates: [{ id: "typecheck", kind: "command" }] },
    { id: "b", dependsOn: ["a"], gates: [] },
  ],
};

describe("corpus: position@v1, produced by the real positionOf", () => {
  it("validates a real, code-produced position", () => {
    const projection = fold([
      { kind: "node-created", node: { graph: "g", id: "g" } },
      { kind: "node-created", node: { graph: "g", id: "a" } },
      { kind: "node-created", node: { graph: "g", id: "b" } },
      {
        kind: "gate-moved",
        node: { graph: "g", id: "a" },
        gate: "typecheck",
        to: gate.satisfied(okReceipt),
      },
      {
        kind: "outcome-set",
        node: { graph: "g", id: "a" },
        outcome: { kind: "cleared", receipts: [okReceipt] },
      },
    ]);

    const position = positionOf(document, projection, "content-hash", Date.now());
    const registry = buildRegistry();
    const validate = registry.ajv.getSchema(
      "https://github.com/rodrigopsasaki/interlock/schemas/position@v1.json",
    );
    const valid = validate?.(position);
    expect(valid, JSON.stringify(validate?.errors)).toBe(true);
    expect(position.nodes.map((n) => n.state.kind)).toEqual(["outcome", "ready"]);
  });
});
