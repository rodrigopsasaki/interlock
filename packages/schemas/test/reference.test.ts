import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReference, docsShapesPath, generateReference } from "../src/reference.ts";

const repoRoot = join(import.meta.dirname, "..", "..", "..");

describe("reference: docs/shapes.md stays fresh against the schemas", () => {
  it("regenerating from the committed schemas reproduces the committed page byte for byte", () => {
    const committed = readFileSync(docsShapesPath(repoRoot), "utf-8");
    const { markdown } = generateReference({ repoRoot });
    const result = checkReference(committed, markdown);
    expect(
      result.fresh,
      `first differs at line ${String(result.firstDifferingLine)}: expected ${JSON.stringify(result.expectedLine)}, got ${JSON.stringify(result.actualLine)}`,
    ).toBe(true);
  });

  it("regenerating twice in a row over unchanged schemas is byte-identical", () => {
    const first = generateReference({ repoRoot }).markdown;
    const second = generateReference({ repoRoot }).markdown;
    expect(second).toBe(first);
  });

  it("lists every artifact term this repository's vocabulary table has no row for", () => {
    const { missingVocabularyTerms } = generateReference({ repoRoot });
    expect(missingVocabularyTerms).toEqual(["config", "event", "item", "local", "notes"]);
  });

  it("finds a purpose sentence for every artifact term the vocabulary does carry", () => {
    const { markdown } = generateReference({ repoRoot });
    expect(markdown).toContain(
      "What a session is given: node, acceptance, gates, context slice, role.",
    );
    expect(markdown).toContain("The directed acyclic graph of nodes produced from one ask.");
  });
});
