import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();

describe("machine@v1 busy policy", () => {
  it("publishes a machine@v1 schema with all busy fields required", () => {
    const schema = readFileSync(
      join(import.meta.dirname, "../../../schemas/machine@v1.json"),
      "utf8",
    );
    expect(schema).toContain('"const": "machine@v1"');
    expect(schema).toContain('"exit_code"');
    expect(schema).toContain('"attempts"');
    expect(schema).toContain('"first_backoff_ms"');
    expect(schema).toContain('"max_backoff_ms"');
  });

  it("accepts a complete v1 document and refuses an out-of-range busy field", () => {
    const validate = registry.ajv.getSchema(
      "https://github.com/rodrigopsasaki/interlock/schemas/machine@v1.json",
    );
    if (validate === undefined) throw new Error("machine@v1 schema is unavailable");
    const document = {
      interlock: "machine@v1",
      provider: {
        admit: ["admit"],
        release: ["release"],
        env: ["env"],
        heavy: ["heavy"],
        busy: { exit_code: 75, attempts: 4, first_backoff_ms: 2_000, max_backoff_ms: 60_000 },
      },
    };
    expect(validate(document)).toBe(true);
    expect(
      validate({
        ...document,
        provider: { ...document.provider, busy: { ...document.provider.busy, attempts: 11 } },
      }),
    ).toBe(false);
  });
});
