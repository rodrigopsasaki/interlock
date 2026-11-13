import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
