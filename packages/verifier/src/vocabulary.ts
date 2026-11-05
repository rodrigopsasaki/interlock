import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Derivation, type Mark, mark, nearestTerm } from "ledger";
import type { FileDiff } from "./git.ts";

export const PLAIN_PROGRAMMING_ENGLISH: ReadonlySet<string> = new Set(
  [
    "string",
    "number",
    "boolean",
    "object",
    "symbol",
    "bigint",
    "undefined",
    "null",
    "void",
    "never",
    "unknown",
    "any",
    "true",
    "false",
    "this",
    "super",
    "new",
    "typeof",
    "keyof",
    "in",
    "of",
    "extends",
    "implements",
    "readonly",
    "static",
    "public",
    "private",
    "protected",
    "abstract",
    "async",
    "await",
    "function",
    "class",
    "interface",
    "type",
    "enum",
    "namespace",
    "import",
    "export",
    "from",
    "as",
    "const",
    "let",
    "var",
    "array",
    "readonlyarray",
    "promise",
    "record",
    "map",
    "set",
    "weakmap",
    "weakset",
    "error",
    "typeerror",
    "rangeerror",
    "regexp",
    "date",
    "json",
    "math",
    "console",
    "process",
    "buffer",
    "partial",
    "required",
    "pick",
    "omit",
    "exclude",
    "extract",
    "nonnullable",
    "returntype",
    "parameters",
    "awaited",
    "instancetype",
    "result",
    "ok",
    "err",
    "t",
    "k",
    "v",
    "u",
    "e",
    "r",
    "a",
    "b",
    "fs",
    "path",
    "crypto",
    "url",
    "os",
    "util",
    "events",
    "stream",
    "promises",
    "assert",
    "child_process",
  ].map((word) => word.toLowerCase()),
);

function extractSection(markdown: string, heading: string): string {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

const TABLE_ROW = /^\|\s*([a-z][a-z ]*?)\s*\|/;

export function harnessVocabulary(repoRoot: string): readonly string[] {
  const agentsMd = readFileSync(join(repoRoot, "AGENTS.md"), "utf-8");
  const section = extractSection(agentsMd, "## Vocabulary");
  const terms: string[] = [];
  for (const line of section.split("\n")) {
    const found = TABLE_ROW.exec(line);
    if (found === null) continue;
    const term = (found[1] ?? "").trim();
    if (term === "term" || /^-+$/.test(term.replace(/\s/g, ""))) continue;
    terms.push(term);
  }
  return terms;
}

function pascalCase(term: string): string {
  return term
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

function camelCase(term: string): string {
  const pascal = pascalCase(term);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export function acceptedForms(terms: readonly string[]): ReadonlySet<string> {
  const forms = new Set<string>();
  for (const term of terms) {
    for (const form of [term, term.replace(/\s+/g, ""), pascalCase(term), camelCase(term)]) {
      const lowered = form.toLowerCase();
      forms.add(lowered);
      forms.add(`${lowered}s`);
    }
  }
  return forms;
}

const DECLARATION = /\b(?:type|interface|class|enum)\s+([A-Za-z_$][\w$]*)/g;
const TYPE_POSITION = /:\s*([A-Za-z_$][\w$]*)/g;
const EXTENDS_IMPLEMENTS = /\b(?:extends|implements)\s+([A-Za-z_$][\w$]*)/g;
const GENERIC_ARG = /<\s*([A-Za-z_$][\w$]*)/g;
const MODULE_SPECIFIER = /\bfrom\s+["']([^"']+)["']/g;

function identifierWords(line: string): readonly string[] {
  const words: string[] = [];
  for (const pattern of [DECLARATION, TYPE_POSITION, EXTENDS_IMPLEMENTS, GENERIC_ARG]) {
    for (const found of line.matchAll(pattern)) {
      const word = found[1];
      if (word !== undefined) words.push(word);
    }
  }
  return words;
}

function moduleWords(line: string): readonly string[] {
  const words: string[] = [];
  for (const found of line.matchAll(MODULE_SPECIFIER)) {
    const specifier = found[1];
    if (specifier === undefined) continue;
    const segments = specifier.split("/");
    const last = segments[segments.length - 1] ?? specifier;
    words.push(last.replace(/\.(ts|tsx|js|json)$/, ""));
  }
  return words;
}

export function extractWords(files: readonly FileDiff[]): readonly string[] {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const file of files) {
    if (!file.path.endsWith(".ts")) continue;
    for (const line of file.addedLines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      for (const word of [...identifierWords(line), ...moduleWords(line)]) {
        if (seen.has(word)) continue;
        seen.add(word);
        words.push(word);
      }
    }
  }
  return words;
}

export function vocabularyGaps(
  files: readonly FileDiff[],
  repoRoot: string,
  professedDomainVocabulary: readonly string[],
  derivation: Derivation,
): readonly Mark[] {
  const known = new Set([
    ...acceptedForms(harnessVocabulary(repoRoot)),
    ...acceptedForms(professedDomainVocabulary),
    ...PLAIN_PROGRAMMING_ENGLISH,
  ]);

  const gaps: Mark[] = [];
  for (const word of extractWords(files)) {
    if (known.has(word.toLowerCase())) continue;
    const closest = nearestTerm(word, known);
    gaps.push(
      mark.gap(derivation, {
        term: word,
        nearest: closest.term,
        difference: `${closest.distance} character edit(s) from "${closest.term}"`,
      }),
    );
  }
  return gaps;
}
