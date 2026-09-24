import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("runtimes.example.yaml", () => {
  it("validates every example entry against runtimes@v0", () => {
    const document: unknown = parseYaml(
      readFileSync(join(repoRoot, "runtimes.example.yaml"), "utf8"),
    );
    const validate = validatorFor(buildRegistry(), "runtimes@v0");
    if (validate === undefined) throw new Error("runtimes@v0 schema is unavailable");

    expect(validate(document)).toBe(true);
  });
});
