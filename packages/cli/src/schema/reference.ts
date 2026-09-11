import { readFile, writeFile } from "node:fs/promises";
import { findRepoRoot } from "face";
import { checkReference, docsShapesPath, generateReference } from "schemas";
import type { CommandResult } from "../main.ts";

function gapsNote(missingVocabularyTerms: readonly string[]): string {
  if (missingVocabularyTerms.length === 0) return "";
  return ` (${missingVocabularyTerms.length} artifact term(s) missing from the vocabulary table: ${missingVocabularyTerms.join(", ")})`;
}

async function runCheck(
  path: string,
  generated: string,
  note: string,
): Promise<CommandResult> {
  let committed: string;
  try {
    committed = await readFile(path, "utf-8");
  } catch {
    return {
      exitCode: 1,
      message: `${path}: does not exist; run "interlock schema reference" to generate it.`,
    };
  }

  const result = checkReference(committed, generated);
  if (result.fresh) return { exitCode: 0, message: `${path}: fresh.${note}` };
  return {
    exitCode: 1,
    message: `${path}: stale, first differs at line ${String(result.firstDifferingLine)}.`,
  };
}

export async function runSchemaReference(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const { markdown, missingVocabularyTerms } = generateReference({ repoRoot });
  const path = docsShapesPath(repoRoot);
  const note = gapsNote(missingVocabularyTerms);

  if (args[0] === "--check") return runCheck(path, markdown, note);

  await writeFile(path, markdown, "utf-8");
  return { exitCode: 0, message: `${path}: regenerated.${note}` };
}
