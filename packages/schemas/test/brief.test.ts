import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();
const validate = registry.ajv.getSchema(
  "https://github.com/rodrigopsasaki/interlock/schemas/brief@v1.json",
);

function schemaValid(value: unknown): boolean {
  if (validate === undefined) throw new Error("brief@v1 schema is unavailable");
  return validate(value) === true;
}

function briefWith(contextScope: unknown): unknown {
  return {
    interlock: "brief@v1",
    graph: "g",
    node: "n",
    role: "worker",
    gates: [],
    scope: ["packages/x.ts"],
    context_scope: contextScope,
    substrate: { address: "none" },
  };
}

describe("brief@v1 context_scope schema", () => {
  it.each([
    ["a scalar", "packages/x.ts"],
    ["a mixed list", ["packages/x.ts", 3]],
    ["null", null],
    ["an empty list", []],
    ["duplicates", ["packages/x.ts", "packages/x.ts"]],
  ])("refuses %s", (_name, contextScope) => {
    expect(schemaValid(briefWith(contextScope))).toBe(false);
  });

  it("keeps normalized path safety in the reader, not a schema regex", () => {
    expect(schemaValid(briefWith(["packages/a/../x.ts"]))).toBe(true);
    expect(schemaValid(briefWith(["../outside.ts"]))).toBe(true);
  });
});
