import { isErr } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { parseMachine } from "../../runner/src/machineProvider.ts";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const schema = validatorFor(buildRegistry(), "machine@v0");
function valid(provider: unknown): boolean {
  if (schema === undefined) throw new Error("missing machine@v0");
  return schema({ interlock: "machine@v0", provider }) === true;
}
const provider = {
  admit: ["admit", "{holder}", "{token}", "{pid}"],
  release: ["release", "{token}"],
  env: ["env"],
  heavy: ["heavy"],
};

describe("machine@v0", () => {
  it("accepts explicit none and a complete argv provider", () => {
    expect(valid("none")).toBe(true);
    expect(valid(provider)).toBe(true);
    expect(isErr(parseMachine({ interlock: "machine@v0", provider }))).toBe(false);
  });
  it.each(["admit", "release", "env", "heavy"])("requires %s in schema and runtime", (key) => {
    const fields: Record<string, unknown> = { ...provider };
    delete fields[key];
    expect(valid(fields)).toBe(false);
    expect(isErr(parseMachine({ interlock: "machine@v0", provider: fields }))).toBe(true);
  });
  it.each([null, false, [], {}, "other"])("rejects malformed provider %j", (value) => {
    expect(valid(value)).toBe(false);
  });
  it.each([
    { value: [] },
    { value: [""] },
    { value: [1] },
    { value: ["bin", 1] },
    { value: ["bin\0bad"] },
  ])("rejects malformed argv $value", ({ value }) => {
    for (const key of Object.keys(provider)) {
      const fields = { ...provider, [key]: value };
      expect(valid(fields)).toBe(false);
      expect(isErr(parseMachine({ interlock: "machine@v0", provider: fields }))).toBe(true);
    }
  });
  it("accepts empty arguments after a nonempty executable", () => {
    expect(valid({ ...provider, env: ["bin", ""] })).toBe(true);
  });
  it("refuses a missing or unknown shape version", () => {
    if (schema === undefined) throw new Error("missing schema");
    expect(schema({ provider: "none" })).toBe(false);
    expect(schema({ interlock: "machine@v1", provider: "none" })).toBe(false);
  });
});
