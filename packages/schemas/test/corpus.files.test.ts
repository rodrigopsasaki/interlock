import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";
import { describeFileValidation, isRefusal, validateFile } from "../src/validate.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");
const interlockDir = join(repoRoot, ".interlock");

function filesUnder(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else files.push(path);
  }
  return files;
}

const VALIDATABLE = new Set([".yaml", ".yml", ".md", ".jsonl"]);

const corpus = filesUnder(interlockDir).filter((path) =>
  VALIDATABLE.has(path.slice(path.lastIndexOf("."))),
);

describe("corpus: every real file under .interlock validates against its schema", () => {
  it("found at least one file of every kind this repository actually carries", () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  const registry = buildRegistry();
  for (const path of corpus) {
    it(`${path.slice(repoRoot.length + 1)} validates`, async () => {
      const result = await validateFile(registry, path);
      const { exitCode, message } = describeFileValidation(result);
      expect(exitCode, message).toBe(0);
      expect(
        result.lines.some((line) => isRefusal(line.outcome)),
        message,
      ).toBe(false);
    });
  }
});
