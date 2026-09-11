import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { shapeTag } from "ledger";
import { parse as parseYaml } from "yaml";
import { splitFrontMatter } from "./frontMatter.ts";
import { validatorFor, type SchemaRegistry } from "./registry.ts";

export type ValidationOutcome =
  | { readonly kind: "legacy"; readonly tag: string }
  | { readonly kind: "unrecognized-tag"; readonly tag: string }
  | { readonly kind: "no-tag" }
  | { readonly kind: "valid"; readonly tag: string }
  | {
      readonly kind: "invalid";
      readonly tag: string;
      readonly findings: readonly string[];
    };

function findingsFor(
  registry: SchemaRegistry,
  tag: string,
  value: unknown,
): readonly string[] {
  const validate = validatorFor(registry, tag);
  if (validate === undefined) return [];
  const valid = validate(value);
  if (valid) return [];
  return (validate.errors ?? []).map((error) => {
    const pointer = error.instancePath === "" ? "(root)" : error.instancePath;
    return `${pointer}: ${error.message ?? "is invalid"}.`;
  });
}

function judge(
  registry: SchemaRegistry,
  tag: string,
  value: unknown,
): ValidationOutcome {
  if (!registry.tags.has(tag)) return { kind: "unrecognized-tag", tag };
  const findings = findingsFor(registry, tag, value);
  return findings.length === 0
    ? { kind: "valid", tag }
    : { kind: "invalid", tag, findings };
}

function judgeBriefMarkdown(
  registry: SchemaRegistry,
  content: string,
): ValidationOutcome {
  const frontMatter = splitFrontMatter(content);
  if (frontMatter === undefined) return { kind: "legacy", tag: "brief@v0" };

  const parsed: unknown = parseYaml(frontMatter);
  const tag = shapeTag(parsed);
  if (tag === undefined) return { kind: "legacy", tag: "brief@v0" };
  if (tag !== "brief@v1") return { kind: "unrecognized-tag", tag };
  return judge(registry, tag, parsed);
}

export function judgeValue(
  registry: SchemaRegistry,
  value: unknown,
): ValidationOutcome {
  const tag = shapeTag(value);
  return tag === undefined ? { kind: "no-tag" } : judge(registry, tag, value);
}

export interface FileValidation {
  readonly path: string;
  readonly lines: readonly {
    readonly line: number;
    readonly outcome: ValidationOutcome;
  }[];
}

export async function validateFile(
  registry: SchemaRegistry,
  path: string,
): Promise<FileValidation> {
  const content = await readFile(path, "utf-8");
  const extension = extname(path);

  if (extension === ".jsonl") {
    const lines = content
      .split("\n")
      .map((text, index) => ({ text, line: index + 1 }))
      .filter(({ text }) => text.trim().length > 0)
      .map(({ text, line }) => ({
        line,
        outcome: judgeValue(registry, JSON.parse(text) as unknown),
      }));
    return { path, lines };
  }

  if (extension === ".md") {
    return {
      path,
      lines: [{ line: 1, outcome: judgeBriefMarkdown(registry, content) }],
    };
  }

  const parsed: unknown = parseYaml(content);
  return { path, lines: [{ line: 1, outcome: judgeValue(registry, parsed) }] };
}

export function describeOutcome(outcome: ValidationOutcome): string {
  switch (outcome.kind) {
    case "legacy":
      return `valid as ${outcome.tag}; the runner requires brief@v1.`;
    case "no-tag":
      return 'carries no "interlock" shape tag.';
    case "unrecognized-tag":
      return `"${outcome.tag}" names no schema this package knows.`;
    case "valid":
      return `valid as ${outcome.tag}.`;
    case "invalid":
      return [`invalid as ${outcome.tag}:`, ...outcome.findings].join(" ");
  }
}

export function isRefusal(outcome: ValidationOutcome): boolean {
  return (
    outcome.kind === "invalid" ||
    outcome.kind === "unrecognized-tag" ||
    outcome.kind === "no-tag"
  );
}

export function describeFileValidation(result: FileValidation): {
  readonly exitCode: number;
  readonly message: string;
} {
  const oneLine = result.lines.length === 1 && result.lines[0] !== undefined;
  const messages = result.lines.map(({ line, outcome }) =>
    oneLine
      ? `${result.path}: ${describeOutcome(outcome)}`
      : `${result.path}:${line}: ${describeOutcome(outcome)}`,
  );
  const exitCode = result.lines.some(({ outcome }) => isRefusal(outcome))
    ? 1
    : 0;
  return { exitCode, message: messages.join("\n") };
}

export {
  buildRegistry,
  defaultSchemasDirectory,
  validatorFor,
} from "./registry.ts";
export type { SchemaRegistry } from "./registry.ts";
