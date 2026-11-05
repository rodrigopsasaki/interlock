import type { GraphDocument } from "face";
import { positionOf } from "face";
import { derivation, duration, fold, gate, type Receipt, sessionRuntime, spend } from "ledger";
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

  it("validates attempts produced from a session-started event", () => {
    const projection = fold([
      { kind: "node-created", node: { graph: "g", id: "g" } },
      { kind: "node-created", node: { graph: "g", id: "a" } },
      { kind: "node-created", node: { graph: "g", id: "b" } },
      {
        kind: "session-started",
        session: {
          id: "session-1",
          node: { graph: "g", id: "a" },
          runtime: sessionRuntime.declared("test-runtime", "test-kind", "test-model"),
        },
        brief: {
          graph: "g",
          node: "a",
          role: "worker",
          acceptance: "exercise attempts",
          gates: [],
          scope: [],
        },
      },
    ]);

    const position = positionOf(document, projection, "content-hash", Date.now());
    const registry = buildRegistry();
    const validate = registry.ajv.getSchema(
      "https://github.com/rodrigopsasaki/interlock/schemas/position@v1.json",
    );
    const valid = validate?.(position);
    expect(valid, JSON.stringify(validate?.errors)).toBe(true);
    expect(position.nodes[0]?.attempts).toEqual([
      {
        session: "session-1",
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
        leaseState: { kind: "none" },
        brief: {
          path: ".interlock/sessions/g/a/brief.md",
          acceptance: "exercise attempts",
          walk: { kind: "none", because: "the node names no role, so its brief carried no walk" },
        },
      },
    ]);
  });

  it("validates an attempt's brief walk and filed debrief with its mark counts", () => {
    const sha = "c".repeat(40);
    const projection = fold([
      { kind: "node-created", node: { graph: "g", id: "a" } },
      {
        kind: "session-started",
        session: { id: "session-1", node: { graph: "g", id: "a" }, runtime: "unknown" },
        brief: { graph: "g", node: "a", role: "reviewer", acceptance: "x", gates: [], scope: [] },
        walk: {
          kind: "address",
          address: "https://substrate.test",
          steps: [{ verb: "context", ask: "What judgment does the lens carry?" }],
        },
      },
      {
        kind: "debrief-filed",
        session: "session-1",
        debrief: {
          graph: "g",
          node: "a",
          role: "reviewer",
          graphBaseSha: sha,
          sessionStartSha: sha,
          headSha: sha,
          derivation: { kind: "human", who: "Rodrigo Sasaki" },
          discoveries: [],
          decisions: [],
          gatesRunByAgent: [],
          open: [],
          findings: { lens: "security", items: [] },
        },
        markCounts: { rooted: 0, unrooted: 0, unexplained: 0, gap: 1 },
      },
    ]);
    const position = positionOf(document, projection, "content-hash", Date.now());
    const validate = buildRegistry().ajv.getSchema(
      "https://github.com/rodrigopsasaki/interlock/schemas/position@v1.json",
    );
    expect(validate?.(position), JSON.stringify(validate?.errors)).toBe(true);
    expect(position.nodes[0]?.attempts[0]?.debrief?.kinds).toEqual(["findings"]);
  });
});
