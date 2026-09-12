import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { type BriefGate, parseBriefGate } from "./briefGate.ts";
import { isValidScopePath } from "./briefScopePath.ts";
import { type BriefSubstrate, parseBriefSubstrate } from "./briefSubstrate.ts";
import { isPlainWord } from "./role.ts";
import { isShaLike } from "./sha.ts";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export const BRIEF_V1 = "brief@v1";

const V1_REQUIRED_FIELDS = ["graph", "node", "role", "gates", "scope", "substrate"] as const;

export type BriefRunnerFields =
  | { readonly kind: "repository" }
  | {
      readonly kind: "worktree";
      readonly graphBaseSha: string;
      readonly session: string;
    };

export interface BriefFrontMatter {
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly gates: readonly BriefGate[];
  readonly scope: readonly string[];
  readonly substrate: BriefSubstrate;
  readonly runner: BriefRunnerFields;
}

export interface LegacyBrief {
  readonly kind: "legacy";
  readonly missingFields: readonly string[];
}

export interface V1Brief {
  readonly kind: "v1";
  readonly frontMatter: BriefFrontMatter;
  readonly body: string;
}

export type BriefRead = LegacyBrief | V1Brief;

export type BriefRefusal =
  | { readonly kind: "missing-file"; readonly path: string }
  | {
      readonly kind: "malformed-front-matter";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "unknown-tag";
      readonly path: string;
      readonly tag: string;
    }
  | {
      readonly kind: "invalid-front-matter";
      readonly path: string;
      readonly reason: string;
    };

export function explainBriefRefusal(refusal: BriefRefusal): string {
  switch (refusal.kind) {
    case "missing-file":
      return `${refusal.path}: no such file.`;
    case "malformed-front-matter":
      return `${refusal.path}: ${refusal.reason}`;
    case "unknown-tag":
      return `${refusal.path}: front matter shape tag is "${refusal.tag}", expected "${BRIEF_V1}".`;
    case "invalid-front-matter":
      return `${refusal.path}: ${refusal.reason}`;
  }
}

export function explainLegacyBrief(legacy: LegacyBrief): string {
  return `brief@v0, legacy; ${BRIEF_V1} would require: ${legacy.missingFields.join(", ")}.`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function invalid(path: string, reason: string): Result<never, BriefRefusal> {
  return err({ kind: "invalid-front-matter", path, reason });
}

const legacyRead: BriefRead = {
  kind: "legacy",
  missingFields: [...V1_REQUIRED_FIELDS],
};

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

function splitFrontMatter(
  raw: string,
): { readonly frontMatter: string; readonly body: string } | undefined {
  const match = FRONT_MATTER.exec(raw);
  if (match === null) return undefined;
  const [, frontMatter, body] = match;
  if (frontMatter === undefined || body === undefined) return undefined;
  return { frontMatter, body };
}

function parseGates(
  parsed: Record<string, unknown>,
  path: string,
): Result<readonly BriefGate[], BriefRefusal> {
  const raw = prop(parsed, "gates");
  if (!Array.isArray(raw)) return invalid(path, '"gates" must be a list');
  const gates: BriefGate[] = [];
  for (const [index, entry] of raw.entries()) {
    const parsedGate = parseBriefGate(entry, index);
    if (isErr(parsedGate)) return invalid(path, parsedGate.error);
    gates.push(parsedGate.value);
  }
  return ok(gates);
}

function parseScope(
  parsed: Record<string, unknown>,
  path: string,
): Result<readonly string[], BriefRefusal> {
  const raw = prop(parsed, "scope");
  if (!isStringArray(raw)) return invalid(path, '"scope" must be a list of strings');
  for (const [index, entry] of raw.entries()) {
    if (!isValidScopePath(entry)) {
      return invalid(
        path,
        `scope[${index}]: "${entry}" is absolute or escapes the repository root`,
      );
    }
  }
  return ok(raw);
}

function parseRunnerFields(
  parsed: Record<string, unknown>,
  path: string,
): Result<BriefRunnerFields, BriefRefusal> {
  const rawGraphBaseSha = prop(parsed, "graph_base_sha");
  const rawSession = prop(parsed, "session");
  if (rawGraphBaseSha === undefined && rawSession === undefined) {
    return ok({ kind: "repository" });
  }
  if (!isString(rawGraphBaseSha) || !isShaLike(rawGraphBaseSha)) {
    return invalid(path, '"graph_base_sha" is missing or not a 40-character SHA');
  }
  if (!isString(rawSession) || rawSession.length === 0) {
    return invalid(path, '"session" is missing or not a string');
  }
  return ok({
    kind: "worktree",
    graphBaseSha: rawGraphBaseSha,
    session: rawSession,
  });
}

function parseV1(
  parsed: Record<string, unknown>,
  body: string,
  path: string,
): Result<BriefRead, BriefRefusal> {
  const graph = prop(parsed, "graph");
  if (!isString(graph)) return invalid(path, '"graph" is missing or not a string');

  const node = prop(parsed, "node");
  if (!isString(node)) return invalid(path, '"node" is missing or not a string');

  const role = prop(parsed, "role");
  if (!isString(role)) return invalid(path, '"role" is missing or not a string');
  if (!isPlainWord(role)) return invalid(path, `role "${role}" is not a plain word`);

  const gates = parseGates(parsed, path);
  if (isErr(gates)) return gates;

  const scope = parseScope(parsed, path);
  if (isErr(scope)) return scope;

  const substrate = parseBriefSubstrate(prop(parsed, "substrate"));
  if (isErr(substrate)) return invalid(path, substrate.error);

  const runner = parseRunnerFields(parsed, path);
  if (isErr(runner)) return runner;

  return ok({
    kind: "v1",
    frontMatter: {
      graph,
      node,
      role,
      gates: gates.value,
      scope: scope.value,
      substrate: substrate.value,
      runner: runner.value,
    },
    body,
  });
}

export async function readBriefFile(path: string): Promise<Result<BriefRead, BriefRefusal>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return err({ kind: "missing-file", path });
    throw error;
  }

  const split = splitFrontMatter(raw);
  if (split === undefined) return ok(legacyRead);

  let parsed: unknown;
  try {
    parsed = parseYaml(split.frontMatter);
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed-front-matter", path, reason });
  }

  if (!isRecord(parsed)) return ok(legacyRead);

  const tag = prop(parsed, "interlock");
  if (tag === undefined) return ok(legacyRead);
  if (tag !== BRIEF_V1) {
    if (!isString(tag)) return ok(legacyRead);
    return err({ kind: "unknown-tag", path, tag });
  }

  return parseV1(parsed, split.body, path);
}
