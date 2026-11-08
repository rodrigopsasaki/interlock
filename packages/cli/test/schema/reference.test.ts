import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { docsShapesPath, generateReference } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { initFixtureRepository } from "../../../../test/support/gitFixture.ts";
import { runSchemaReference } from "../../src/schema/reference.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "schema-reference-"));
  initFixtureRepository(directory, { defaultBranch: "main" });
  writeFileSync(
    join(directory, "AGENTS.md"),
    [
      "## Vocabulary",
      "",
      "| term | means |",
      "| --- | --- |",
      "| arcs | fixture |",
      "| commits | fixture |",
      "| positions | fixture |",
      "| queue | fixture |",
      "| roles | fixture |",
      "| runtimes | fixture |",
      "",
    ].join("\n"),
  );
  mkdirSync(join(directory, "docs"), { recursive: true });
  writeFileSync(
    docsShapesPath(directory),
    generateReference({ repoRoot: directory, sources: [] }).markdown,
  );
  return directory;
}

describe("runSchemaReference", () => {
  it("--check reports a fixture docs/shapes.md as fresh", async () => {
    const repoRoot = fixture();
    const result = await runSchemaReference(["--check"], { cwd: repoRoot, sources: [] });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("fresh.");
  });

  it("--check names the artifact terms missing from the vocabulary table", async () => {
    const repoRoot = fixture();
    const result = await runSchemaReference(["--check"], { cwd: repoRoot, sources: [] });
    for (const term of ["config", "event", "item", "local", "machine", "notes"]) {
      expect(result.message).toContain(term);
    }
  });
});
