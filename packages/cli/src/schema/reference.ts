import { readFile, writeFile } from "node:fs/promises";
import { findRepoRoot } from "face";
import { checkReference, docsShapesPath, generateReference } from "schemas";
import type { CommandResult } from "../main.ts";

const briefAuthoringReadmeRequirements: readonly string[] = [
  "## Brief authoring",
  ".interlock/sessions/<graph>/<node>/brief.md",
  "node's acceptance and gates",
  "repository's standing gates",
  "tracked scope",
  "slice selection",
  "supplied role",
  "immutable once the session starts",
  "no brief; brief authoring is not the runner's",
  "self-declare its role or lower its gates",
  "replaces `gates` with the standing gates plus the node's gates",
  "replaces `scope` with the runner's current tracked files",
  "substrate.address: none",
];

const briefAuthoringExampleRequirements: readonly string[] = [
  "#### `brief@v1`",
  "Source: `.interlock/sessions/0010-learning-transfer/source-diagnosis/brief.md`",
  "interlock: brief@v1",
  "graph: 0010-learning-transfer",
  "node: source-diagnosis",
  "role: worker",
  "gates: []",
  "scope:",
  "substrate:",
];

function normalizedWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function gapsNote(missingVocabularyTerms: readonly string[]): string {
  if (missingVocabularyTerms.length === 0) return "";
  return ` (${missingVocabularyTerms.length} artifact term(s) missing from the vocabulary table: ${missingVocabularyTerms.join(", ")})`;
}

async function runCheck(path: string, generated: string, note: string): Promise<CommandResult> {
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

async function checkBriefAuthoring(repoRoot: string, generated: string): Promise<CommandResult> {
  let readme: string;
  try {
    readme = await readFile(`${repoRoot}/README.md`, "utf-8");
  } catch {
    return {
      exitCode: 1,
      message: `${repoRoot}/README.md: brief-authoring: stale; documentation is missing.`,
    };
  }

  const missingReadmeRequirement = briefAuthoringReadmeRequirements.find(
    (requirement) => !normalizedWhitespace(readme).includes(normalizedWhitespace(requirement)),
  );
  if (missingReadmeRequirement !== undefined) {
    return {
      exitCode: 1,
      message: `${repoRoot}/README.md: brief-authoring: stale; missing "${missingReadmeRequirement}".`,
    };
  }

  const missingExampleRequirement = briefAuthoringExampleRequirements.find(
    (requirement) => !generated.includes(requirement),
  );
  if (missingExampleRequirement !== undefined) {
    return {
      exitCode: 1,
      message: `${docsShapesPath(repoRoot)}: brief-authoring: stale; missing "${missingExampleRequirement}".`,
    };
  }

  return { exitCode: 0, message: "brief-authoring: fresh" };
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
  const check = args.includes("--check");
  const briefAuthoring = args.includes("--brief-authoring");

  if (briefAuthoring && !check) {
    return {
      exitCode: 1,
      message: "interlock schema reference: --brief-authoring requires --check; it is read-only.",
    };
  }

  if (check) {
    const result = await runCheck(path, markdown, note);
    if (result.exitCode !== 0 || !briefAuthoring) return result;
    const authoring = await checkBriefAuthoring(repoRoot, markdown);
    if (authoring.exitCode !== 0) return authoring;
    return { exitCode: 0, message: `${result.message} ${authoring.message}` };
  }

  await writeFile(path, markdown, "utf-8");
  return { exitCode: 0, message: `${path}: regenerated.${note}` };
}
