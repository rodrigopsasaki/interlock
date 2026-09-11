import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { shapeTag } from "ledger";
import { parse as parseYaml } from "yaml";
import { splitFrontMatter } from "../frontMatter.ts";

export interface Example {
  readonly sourcePath: string;
  readonly content: string;
  readonly language: "yaml" | "json" | "markdown";
}

interface Candidate {
  readonly tag: string;
  readonly content: string;
  readonly language: Example["language"];
}

const VALIDATABLE = new Set([".yaml", ".yml", ".md", ".jsonl"]);

const LEDGER_FIXTURES = [
  "journal-v1-approved.jsonl",
  "journal-v1-v2-2026-09-10.jsonl",
  "journal-v3-v4-2026-09-11.jsonl",
];

function filesUnder(directory: string): readonly string[] {
  const files: string[] = [];
  const entries = readdirSync(directory, { withFileTypes: true }).toSorted(
    (a, b) => a.name.localeCompare(b.name),
  );
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (VALIDATABLE.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function candidatesFromMarkdown(content: string): readonly Candidate[] {
  const frontMatter = splitFrontMatter(content);
  if (frontMatter === undefined) {
    return [{ tag: "brief@v0", content: content.trim(), language: "markdown" }];
  }
  const parsed: unknown = parseYaml(frontMatter);
  const tag = shapeTag(parsed);
  return tag === undefined
    ? []
    : [{ tag, content: frontMatter.trim(), language: "yaml" }];
}

function candidatesFromJsonl(content: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed: unknown = JSON.parse(line);
    const tag = shapeTag(parsed);
    if (tag !== undefined)
      candidates.push({ tag, content: line.trim(), language: "json" });
  }
  return candidates;
}

function candidatesFromYaml(content: string): readonly Candidate[] {
  const parsed: unknown = parseYaml(content);
  const tag = shapeTag(parsed);
  return tag === undefined
    ? []
    : [{ tag, content: content.trim(), language: "yaml" }];
}

function candidatesInFile(absPath: string): readonly Candidate[] {
  const content = readFileSync(absPath, "utf-8");
  const extension = extname(absPath);
  if (extension === ".md") return candidatesFromMarkdown(content);
  if (extension === ".jsonl") return candidatesFromJsonl(content);
  return candidatesFromYaml(content);
}

export function buildCorpusExamples(
  repoRoot: string,
  ledgerFixturesDirectory: string,
): ReadonlyMap<string, Example> {
  const files = [
    ...filesUnder(join(repoRoot, ".interlock")),
    ...LEDGER_FIXTURES.map((name) => join(ledgerFixturesDirectory, name)),
  ];

  const examples = new Map<string, Example>();
  for (const absPath of files) {
    for (const candidate of candidatesInFile(absPath)) {
      if (examples.has(candidate.tag)) continue;
      examples.set(candidate.tag, {
        sourcePath: relative(repoRoot, absPath),
        content: candidate.content,
        language: candidate.language,
      });
    }
  }
  return examples;
}
