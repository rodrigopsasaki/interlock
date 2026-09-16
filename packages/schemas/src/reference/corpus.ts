import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { shapeTag } from "ledger";
import { parse as parseYaml } from "yaml";
import { splitFrontMatter } from "../frontMatter.ts";
import { buildRegistry, type SchemaRegistry, validatorFor } from "../registry.ts";

export interface Example {
  readonly sourcePath: string;
  readonly content: string;
  readonly language: "yaml" | "json" | "md";
}

export interface ReferenceSource {
  readonly sourcePath: string;
  readonly tag: string;
}

interface Candidate {
  readonly tag: string;
  readonly content: string;
  readonly language: Example["language"];
  readonly value: unknown;
}

export const referenceSources: readonly ReferenceSource[] = [
  { sourcePath: ".interlock/sessions/0001-bootstrap/scaffold/brief.md", tag: "brief@v0" },
  {
    sourcePath: ".interlock/sessions/0010-learning-transfer/source-diagnosis/brief.md",
    tag: "brief@v1",
  },
  { sourcePath: ".interlock/config.yaml", tag: "config@v0" },
  { sourcePath: ".interlock/sessions/0001-bootstrap/scaffold/debrief.yaml", tag: "debrief@v0" },
  { sourcePath: ".interlock/sessions/0001-bootstrap/face-read/debrief.yaml", tag: "debrief@v1" },
  {
    sourcePath:
      ".interlock/sessions/0014-qualified-citations/qualify-explicit-location/debrief.yaml",
    tag: "debrief@v2",
  },
  { sourcePath: "packages/ledger/test/fixtures/journal-v1-approved.jsonl", tag: "event@v1" },
  {
    sourcePath: "packages/ledger/test/fixtures/journal-v1-v2-2026-09-10.jsonl",
    tag: "event@v2",
  },
  {
    sourcePath: "packages/ledger/test/fixtures/journal-v3-v4-2026-09-11.jsonl",
    tag: "event@v3",
  },
  { sourcePath: ".interlock/graphs/0019-next-briefing-strategy.yaml", tag: "graph@v0" },
  { sourcePath: ".interlock/local.example.yaml", tag: "local@v0" },
  {
    sourcePath: ".interlock/sessions/0019-next-briefing-strategy/propose-next-briefs/notes.yaml",
    tag: "notes@v0",
  },
];

function candidatesFromMarkdown(content: string): readonly Candidate[] {
  const frontMatter = splitFrontMatter(content);
  if (frontMatter === undefined) {
    return [{ tag: "brief@v0", content: content.trim(), language: "md", value: content }];
  }
  const parsed: unknown = parseYaml(frontMatter);
  const tag = shapeTag(parsed);
  return tag === undefined
    ? []
    : [{ tag, content: frontMatter.trim(), language: "yaml", value: parsed }];
}

function candidatesFromJsonl(content: string): readonly Candidate[] {
  const candidates: Candidate[] = [];
  for (const line of content.split("\n")) {
    if (line.trim().length === 0) continue;
    const parsed: unknown = JSON.parse(line);
    const tag = shapeTag(parsed);
    if (tag !== undefined) {
      candidates.push({ tag, content: line.trim(), language: "json", value: parsed });
    }
  }
  return candidates;
}

function candidatesFromYaml(content: string): readonly Candidate[] {
  const parsed: unknown = parseYaml(content);
  const tag = shapeTag(parsed);
  return tag === undefined
    ? []
    : [{ tag, content: content.trim(), language: "yaml", value: parsed }];
}

function candidatesInFile(absPath: string): readonly Candidate[] {
  const content = readFileSync(absPath, "utf-8");
  const extension = extname(absPath);
  if (extension === ".md") return candidatesFromMarkdown(content);
  if (extension === ".jsonl") return candidatesFromJsonl(content);
  return candidatesFromYaml(content);
}

function validationError(
  source: ReferenceSource,
  candidate: Candidate,
  registry: SchemaRegistry,
): string | undefined {
  const validate = validatorFor(registry, candidate.tag);
  if (validate === undefined) {
    return `Reference source "${source.sourcePath}" selects unknown shape "${candidate.tag}".`;
  }
  if (validate(candidate.value)) return undefined;
  const findings = (validate.errors ?? [])
    .map((error) => {
      const pointer = error.instancePath === "" ? "(root)" : error.instancePath;
      return `${pointer}: ${error.message ?? "is invalid"}.`;
    })
    .join(" ");
  return `Reference source "${source.sourcePath}" selects invalid "${candidate.tag}": ${findings}`;
}

export function buildCorpusExamples(
  repoRoot: string,
  sources: readonly ReferenceSource[] = referenceSources,
  registry: SchemaRegistry = buildRegistry(),
): ReadonlyMap<string, Example> {
  const examples = new Map<string, Example>();
  for (const source of sources) {
    const absPath = join(repoRoot, source.sourcePath);
    if (!existsSync(absPath)) {
      throw new Error(
        `Reference source "${source.sourcePath}" for "${source.tag}" does not exist.`,
      );
    }
    const candidate = candidatesInFile(absPath).find(({ tag }) => tag === source.tag);
    if (candidate === undefined) {
      throw new Error(
        `Reference source "${source.sourcePath}" does not carry expected shape "${source.tag}".`,
      );
    }
    const invalid = validationError(source, candidate, registry);
    if (invalid !== undefined) throw new Error(invalid);
    examples.set(source.tag, {
      sourcePath: source.sourcePath,
      content: candidate.content,
      language: candidate.language,
    });
  }
  return examples;
}
