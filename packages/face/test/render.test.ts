import { duration, fold, heldOn, type LedgerEvent, outcome } from "ledger";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { positionOf } from "../src/position.ts";
import { renderPosition } from "../src/render.ts";

const document: GraphDocument = {
  id: "demo",
  gates: [{ id: "approved", kind: "human" }],
  nodes: [
    { id: "a", dependsOn: [], gates: [{ id: "typecheck", kind: "command" }] },
    { id: "b", dependsOn: ["a"], gates: [] },
  ],
};

describe("renderPosition", () => {
  it("is a pure function of the position value: same input, same text", () => {
    const position = positionOf(document, fold([]), "hash", Date.now());
    expect(renderPosition(position)).toBe(renderPosition(position));
  });

  it("names every node, its approval line, and the critical path, so nothing in the value is silently dropped", () => {
    const position = positionOf(document, fold([]), "hash", Date.now());
    const text = renderPosition(position);
    expect(text).toContain("demo");
    expect(text).toContain("not approved");
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(text).toContain("critical path");
  });

  it("names the because on a held node, not just the outcome kind", () => {
    const events: readonly LedgerEvent[] = [
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "a" },
        outcome: outcome.held(
          [],
          heldOn.uncommittedWork(3),
          "3 uncommitted path(s) in the worktree; gates judge commits only",
          30_000,
        ),
      },
    ];
    const position = positionOf(document, fold(events), "hash", Date.now());
    const text = renderPosition(position);
    expect(text).toContain(
      "a — held: 3 uncommitted path(s) in the worktree; gates judge commits only",
    );
  });

  it("prints a float line only for a node whose float is measured, silent otherwise", () => {
    const unmeasuredText = renderPosition(positionOf(document, fold([]), "hash", Date.now()));
    expect(unmeasuredText).not.toContain("float:");

    const solo: GraphDocument = {
      id: "demo",
      gates: [],
      nodes: [
        {
          id: "solo",
          dependsOn: [],
          gates: [{ id: "typecheck", kind: "command" }],
        },
      ],
    };
    const events: readonly LedgerEvent[] = [
      {
        kind: "outcome-set",
        node: { graph: "demo", id: "solo" },
        outcome: {
          kind: "cleared",
          receipts: [
            {
              id: "receipt-typecheck",
              gate: "typecheck",
              commitSha: "deadbeef",
              spend: { kind: "none" },
              duration: duration.measured(1500),
              derivation: {
                kind: "gate",
                gate: "typecheck",
                version: "1",
                runner: "test",
              },
              proof: {},
            },
          ],
        },
      },
    ];
    const measuredText = renderPosition(positionOf(solo, fold(events), "hash", Date.now()));
    expect(measuredText).toContain("float: 0ms");
  });
});
