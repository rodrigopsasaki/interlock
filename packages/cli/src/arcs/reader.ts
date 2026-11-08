import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml } from "yaml";
import { gitOrigin, repositoryForOrigin } from "../repositoryOrigin.ts";

export const ARCS_V0 = "arcs@v0";
export const ARCS_V1 = "arcs@v1";

export interface ArcWords {
  readonly words: string;
  readonly source: string;
}

export interface ArcRelation {
  readonly graph: string;
  readonly because: string;
}

export interface Arc {
  readonly id: string;
  readonly title: string;
  readonly ask: string;
  readonly askForm: "verbatim" | "placeholder";
  readonly source: string;
  readonly alsoSaid: readonly ArcWords[];
  readonly graphs: readonly string[];
  readonly superseded: readonly ArcRelation[];
  readonly context: readonly ArcRelation[];
  readonly version?: string;
  readonly approved?: ArcWords;
  readonly passed?: string;
  readonly authorizedBy?: ArcWords;
}

export interface NeedsHisWords {
  readonly graph: string;
  readonly found: string;
}

export interface ArcRegistry {
  readonly version: typeof ARCS_V0 | typeof ARCS_V1;
  readonly repository: string;
  readonly arcs: readonly Arc[];
  readonly needsHisWords: readonly NeedsHisWords[];
}

export type ArcReadRefusal =
  | { readonly kind: "missing"; readonly path: string }
  | { readonly kind: "malformed"; readonly path: string; readonly reason: string }
  | { readonly kind: "identity"; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringAt(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function requiredString(record: Record<string, unknown>, key: string): Result<string, string> {
  const value = stringAt(record, key);
  return value === undefined || value.length === 0
    ? err(`"${key}" is missing or not a non-empty string`)
    : ok(value);
}

function stringList(value: unknown, key: string): Result<readonly string[], string> {
  if (!Array.isArray(value)) return err(`"${key}" must be a list`);
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") return err(`"${key}" must contain only strings`);
    if (!result.includes(item)) result.push(item);
  }
  return ok(result);
}

function wordsAt(value: unknown, context: string): Result<ArcWords, string> {
  if (!isRecord(value)) return err(`${context} must be a mapping`);
  const words = requiredString(value, "words");
  if (isErr(words)) return words;
  const source = requiredString(value, "source");
  if (isErr(source)) return source;
  return ok({ words: words.value, source: source.value });
}

function wordsList(value: unknown, key: string): Result<readonly ArcWords[], string> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value)) return err(`"${key}" must be a list`);
  const result: ArcWords[] = [];
  for (const [index, item] of value.entries()) {
    const parsed = wordsAt(item, `"${key}" entry ${index}`);
    if (isErr(parsed)) return parsed;
    result.push(parsed.value);
  }
  return ok(result);
}

function relationsList(value: unknown, key: string): Result<readonly ArcRelation[], string> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value)) return err(`"${key}" must be a list`);
  const result: ArcRelation[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return err(`"${key}" entry ${index} must be a mapping`);
    const graph = requiredString(item, "graph");
    if (isErr(graph)) return graph;
    const because = requiredString(item, "because");
    if (isErr(because)) return because;
    result.push({ graph: graph.value, because: because.value });
  }
  return ok(result);
}

function arcAt(value: unknown, version: typeof ARCS_V0 | typeof ARCS_V1): Result<Arc, string> {
  if (!isRecord(value)) return err("arc must be a mapping");
  const id = requiredString(value, "id");
  if (isErr(id)) return id;
  const title = requiredString(value, "title");
  if (isErr(title)) return title;
  const ask = requiredString(value, "ask");
  if (isErr(ask)) return ask;
  const source = requiredString(value, "source");
  if (isErr(source)) return source;
  const graphs = stringList(value["graphs"], "graphs");
  if (isErr(graphs)) return graphs;
  const alsoSaid = wordsList(value["also_said"], "also_said");
  if (isErr(alsoSaid)) return alsoSaid;
  const superseded = relationsList(value["superseded"], "superseded");
  if (isErr(superseded)) return superseded;
  const context = relationsList(value["context"], "context");
  if (isErr(context)) return context;

  const askFormValue = stringAt(value, "ask_form");
  if (version === ARCS_V0 && askFormValue !== undefined) {
    return err('"ask_form" is not part of arcs@v0');
  }
  if (askFormValue !== undefined && askFormValue !== "verbatim" && askFormValue !== "placeholder") {
    return err('"ask_form" must be "verbatim" or "placeholder"');
  }

  const approved = value["approved"] === undefined ? undefined : wordsAt(value["approved"], "approved");
  if (approved !== undefined && isErr(approved)) return approved;
  const authorizedBy =
    value["authorized_by"] === undefined ? undefined : wordsAt(value["authorized_by"], "authorized_by");
  if (authorizedBy !== undefined && isErr(authorizedBy)) return authorizedBy;
  const optionalVersion = stringAt(value, "version");
  const passed = stringAt(value, "passed");

  return ok({
    id: id.value,
    title: title.value,
    ask: ask.value,
    askForm: askFormValue === "placeholder" ? "placeholder" : "verbatim",
    source: source.value,
    alsoSaid: alsoSaid.value,
    graphs: graphs.value,
    superseded: superseded.value,
    context: context.value,
    ...(optionalVersion === undefined ? {} : { version: optionalVersion }),
    ...(approved === undefined ? {} : { approved: approved.value }),
    ...(passed === undefined ? {} : { passed }),
    ...(authorizedBy === undefined ? {} : { authorizedBy: authorizedBy.value }),
  });
}

function needsHisWordsAt(value: unknown): Result<readonly NeedsHisWords[], string> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value)) return err('"needs_his_words" must be a list');
  const result: NeedsHisWords[] = [];
  for (const [index, item] of value.entries()) {
    if (!isRecord(item)) return err(`"needs_his_words" entry ${index} must be a mapping`);
    const graph = requiredString(item, "graph");
    if (isErr(graph)) return graph;
    const found = requiredString(item, "found");
    if (isErr(found)) return found;
    result.push({ graph: graph.value, found: found.value });
  }
  return ok(result);
}

export function parseArcsRegistry(
  value: unknown,
  repository: string | undefined,
): Result<ArcRegistry, string> {
  if (!isRecord(value)) return err("the document is not a YAML mapping");
  const tag = stringAt(value, "interlock");
  if (tag !== ARCS_V0 && tag !== ARCS_V1) return err(`shape tag is missing or unsupported: ${tag ?? "none"}`);
  const declaredRepository = stringAt(value, "repository");
  if (tag === ARCS_V1 && declaredRepository === undefined) {
    return err('"repository" is missing or not a non-empty string');
  }
  const resolvedRepository = tag === ARCS_V1 ? declaredRepository : repository;
  if (resolvedRepository === undefined || resolvedRepository.length === 0) {
    return err("repository identity is unavailable; run interlock arcs migrate --repository <name>");
  }
  const rawArcs = value["arcs"];
  if (!Array.isArray(rawArcs)) return err('"arcs" is missing or not a list');
  const arcs: Arc[] = [];
  for (const [index, rawArc] of rawArcs.entries()) {
    const parsed = arcAt(rawArc, tag);
    if (isErr(parsed)) return err(`arc ${index}: ${parsed.error}`);
    arcs.push(parsed.value);
  }
  const needs = needsHisWordsAt(value["needs_his_words"]);
  if (isErr(needs)) return needs;
  return ok({ version: tag, repository: resolvedRepository, arcs, needsHisWords: needs.value });
}

export async function readArcsRegistry(repoRoot: string): Promise<Result<ArcRegistry, ArcReadRefusal>> {
  const path = `${repoRoot}/.interlock/arcs.yaml`;
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return err({ kind: "missing", path });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    return err({ kind: "malformed", path, reason: error instanceof Error ? error.message : "invalid YAML" });
  }
  const tag = isRecord(parsed) ? stringAt(parsed, "interlock") : undefined;
  if (tag === ARCS_V1) {
    const registry = parseArcsRegistry(parsed, undefined);
    return isErr(registry) ? err({ kind: "malformed", path, reason: registry.error }) : registry;
  }
  if (tag !== ARCS_V0) return err({ kind: "malformed", path, reason: `unsupported shape ${tag ?? "none"}` });

  const origin = await gitOrigin(repoRoot);
  if (isErr(origin)) return err({ kind: "identity", reason: "repository identity is unavailable; run interlock arcs migrate --repository <name>" });
  const identity = repositoryForOrigin(origin.value);
  if (isErr(identity)) return err({ kind: "identity", reason: "repository identity is unavailable; run interlock arcs migrate --repository <name>" });
  const registry = parseArcsRegistry(parsed, identity.value.name);
  return isErr(registry) ? err({ kind: "malformed", path, reason: registry.error }) : registry;
}
