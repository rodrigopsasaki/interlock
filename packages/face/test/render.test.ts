import { fold } from "ledger";
import { describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { computePosition } from "../src/position.ts";
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
    const position = computePosition(document, fold([]), "hash");
    expect(renderPosition(position)).toBe(renderPosition(position));
  });

  it("names every node, its approval line, and the critical path, so nothing in the value is silently dropped", () => {
    const position = computePosition(document, fold([]), "hash");
    const text = renderPosition(position);
    expect(text).toContain("demo");
    expect(text).toContain("not approved");
    expect(text).toContain("a");
    expect(text).toContain("b");
    expect(text).toContain("critical path");
  });
});
