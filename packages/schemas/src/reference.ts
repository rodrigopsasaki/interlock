import { join } from "node:path";
import { loadArtifacts } from "./reference/artifacts.ts";
import { buildCorpusExamples } from "./reference/corpus.ts";
import { renderReference } from "./reference/render.ts";
import { vocabularyPurposes } from "./reference/vocabulary.ts";
import { defaultSchemasDirectory } from "./registry.ts";

export interface ReferenceOptions {
  readonly repoRoot?: string;
  readonly schemasDirectory?: string;
}

export interface ReferenceResult {
  readonly markdown: string;
  readonly missingVocabularyTerms: readonly string[];
}

export function docsShapesPath(repoRoot: string): string {
  return join(repoRoot, "docs", "shapes.md");
}

export function generateReference(options: ReferenceOptions = {}): ReferenceResult {
  const schemasDirectory = options.schemasDirectory ?? defaultSchemasDirectory();
  const repoRoot = options.repoRoot ?? join(schemasDirectory, "..");

  const { artifacts, files } = loadArtifacts(schemasDirectory);
  const vocabulary = vocabularyPurposes(join(repoRoot, "AGENTS.md"));
  const ledgerFixturesDirectory = join(repoRoot, "packages", "ledger", "test", "fixtures");
  const examples = buildCorpusExamples(repoRoot, ledgerFixturesDirectory);

  const missingVocabularyTerms = artifacts
    .map((artifact) => artifact.term)
    .filter((term) => !vocabulary.has(term));

  return {
    markdown: renderReference(artifacts, files, vocabulary, examples),
    missingVocabularyTerms,
  };
}

export interface CheckResult {
  readonly fresh: boolean;
  readonly firstDifferingLine: number | undefined;
  readonly expectedLine: string | undefined;
  readonly actualLine: string | undefined;
}

export function checkReference(committed: string, generated: string): CheckResult {
  if (committed === generated) {
    return {
      fresh: true,
      firstDifferingLine: undefined,
      expectedLine: undefined,
      actualLine: undefined,
    };
  }

  const committedLines = committed.split("\n");
  const generatedLines = generated.split("\n");
  const lineCount = Math.max(committedLines.length, generatedLines.length);

  for (let line = 0; line < lineCount; line += 1) {
    const expectedLine = committedLines[line];
    const actualLine = generatedLines[line];
    if (expectedLine !== actualLine) {
      return {
        fresh: false,
        firstDifferingLine: line + 1,
        expectedLine,
        actualLine,
      };
    }
  }
  return {
    fresh: false,
    firstDifferingLine: undefined,
    expectedLine: undefined,
    actualLine: undefined,
  };
}
