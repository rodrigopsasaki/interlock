import { unwrap } from "@phyxiusjs/fp";
import { loadGraphDocumentText, NODE_ROLES, positionOf } from "face";
import { fold } from "ledger";
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

const graphWith = (node: Record<string, unknown>): unknown => ({
  interlock: "graph@v0",
  id: "g",
  nodes: [{ id: "a", ...node }],
});

describe("graph@v0: node role", () => {
  it.each(NODE_ROLES)("accepts the role %s", (role) => {
    expect(valid("graph@v0", graphWith({ role }))).toBe(true);
  });

  it("accepts a node that names no role", () => {
    expect(valid("graph@v0", graphWith({}))).toBe(true);
  });

  it("refuses a word outside the closed set", () => {
    expect(valid("graph@v0", graphWith({ role: "worker" }))).toBe(false);
    expect(valid("graph@v0", graphWith({ role: 3 }))).toBe(false);
  });
});

describe("position@v2: node role, produced by the real positionOf", () => {
  it("validates a position whose node carries a role beside one that names none", () => {
    const document = unwrap(
      loadGraphDocumentText(
        [
          "interlock: graph@v0",
          "id: g",
          "nodes:",
          "  - id: a",
          "    role: reviewer",
          "  - id: b",
          "    depends_on: [a]",
          "",
        ].join("\n"),
        "g.yaml",
      ),
    );
    const projection = fold([
      { kind: "node-created", node: { graph: "g", id: "a" } },
      { kind: "node-created", node: { graph: "g", id: "b" } },
    ]);
    const position = positionOf(document, projection, "content-hash", Date.now());
    expect(position.nodes.map((node) => node.role)).toEqual(["reviewer", undefined]);
    expect(valid("position@v2", position)).toBe(true);
    expect(
      valid("position@v2", { ...position, nodes: [{ ...position.nodes[0], role: "worker" }] }),
    ).toBe(false);
  });
});

describe("brief@v1: role", () => {
  it("keeps every historical word readable beside the six roles", () => {
    for (const role of ["worker", "interpreter", ...NODE_ROLES]) {
      expect(
        valid("brief@v1", {
          interlock: "brief@v1",
          graph: "g",
          node: "n",
          role,
          gates: [],
          scope: [],
          substrate: { address: "none" },
        }),
      ).toBe(true);
    }
  });
});
