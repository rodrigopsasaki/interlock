import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSchemaReference } from "../../src/schema/reference.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

describe("runSchemaReference", () => {
  it("--check reports the committed docs/shapes.md as fresh", async () => {
    const result = await runSchemaReference(["--check"], { cwd: repoRoot });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("fresh.");
  });

  it("--check names the artifact terms missing from the vocabulary table", async () => {
    const result = await runSchemaReference(["--check"], { cwd: repoRoot });
    expect(result.message).toContain("config, event, item, local, notes");
  });
});
