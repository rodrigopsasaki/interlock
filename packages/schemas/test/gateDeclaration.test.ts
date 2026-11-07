import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const validate = buildRegistry().ajv.getSchema(
  "https://github.com/rodrigopsasaki/interlock/schemas/parts/gate-declaration.json",
);

function schemaValid(value: unknown): boolean {
  if (validate === undefined) throw new Error("gate-declaration schema is unavailable");
  return validate(value) === true;
}

describe("gate-declaration id", () => {
  it("accepts an id without a NUL", () => {
    expect(schemaValid({ id: "typecheck", kind: "command" })).toBe(true);
  });

  it("refuses an id with a NUL", () => {
    expect(schemaValid({ id: "type\u0000check", kind: "command" })).toBe(false);
  });
});
