import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { derivation } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import type { FileDiff } from "../src/git.ts";
import {
  acceptedForms,
  extractWords,
  harnessVocabulary,
  vocabularyGaps,
} from "../src/vocabulary.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const AGENTS_MD = [
  "# Working here",
  "",
  "## Vocabulary",
  "",
  "| term | means |",
  "| --- | --- |",
  "| node | One unit of work. |",
  "| critical path | The chain that decides finish. |",
  "",
  "## Conventions",
  "",
  "| seam | first through it |",
  "| --- | --- |",
  "| Gate kinds | command gate |",
].join("\n");

function repoWithAgentsMd(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  writeFileSync(join(directory, "AGENTS.md"), AGENTS_MD);
  return directory;
}

describe("harnessVocabulary", () => {
  it("reads only the Vocabulary table's term column, stopping at the next heading", () => {
    const dir = repoWithAgentsMd();
    expect(harnessVocabulary(dir)).toEqual(["node", "critical path"]);
  });
});

describe("acceptedForms", () => {
  it("accepts PascalCase, camelCase, the raw term, and a plural, case-insensitively", () => {
    const forms = acceptedForms(["critical path"]);
    expect(forms.has("criticalpath")).toBe(true);
    expect(forms.has("criticalpaths")).toBe(true);
    expect(forms.has("critical path")).toBe(true);
  });
});

describe("extractWords", () => {
  it("finds a declared type name, a type-position reference, and a module specifier", () => {
    const files: readonly FileDiff[] = [
      {
        path: "src/x.ts",
        hunks: [],
        addedLines: [
          "export interface Widget {",
          "  readonly owner: Session;",
          "}",
          'import { mark } from "ledger";',
        ],
      },
    ];
    const words = extractWords(files);
    expect(words).toContain("Widget");
    expect(words).toContain("Session");
    expect(words).toContain("ledger");
  });

  it("ignores non-TypeScript files and comment lines", () => {
    const files: readonly FileDiff[] = [
      { path: "README.md", hunks: [], addedLines: ["interface Ghost {}"] },
      {
        path: "src/x.ts",
        hunks: [],
        addedLines: ["// interface CommentedOut {}"],
      },
    ];
    expect(extractWords(files)).toEqual([]);
  });
});

describe("vocabularyGaps", () => {
  it("gaps a word that matches none of the three vocabularies", () => {
    const dir = repoWithAgentsMd();
    const files: readonly FileDiff[] = [
      {
        path: "src/x.ts",
        hunks: [],
        addedLines: ["export interface Frobnicator {}"],
      },
    ];
    const marks = vocabularyGaps(
      files,
      dir,
      [],
      derivation.gate("verifier-hunks", "verifier@0", "test"),
    );
    expect(marks).toHaveLength(1);
    expect(marks[0]?.kind).toBe("gap");
    if (marks[0]?.kind !== "gap") return;
    expect(marks[0].gap.term).toBe("Frobnicator");
  });

  it("does not gap a harness vocabulary word, a plain-English word, or a professed one", () => {
    const dir = repoWithAgentsMd();
    const files: readonly FileDiff[] = [
      {
        path: "src/x.ts",
        hunks: [],
        addedLines: [
          "export interface Node {",
          "  readonly value: string;",
          "  readonly gizmo: Gizmo;",
          "}",
        ],
      },
    ];
    const marks = vocabularyGaps(
      files,
      dir,
      ["gizmo"],
      derivation.gate("verifier-hunks", "verifier@0", "test"),
    );
    expect(marks).toEqual([]);
  });
});
