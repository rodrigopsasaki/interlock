import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { type Debrief, isDebriefDerivation, isDrafted, shapeTag } from "ledger";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { parseDecision } from "./decision.ts";
import { parseDiscovery } from "./discovery.ts";
import { parseGateRun } from "./gateRun.ts";
import { isShaLike } from "./sha.ts";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export const DEBRIEF_V0 = "debrief@v0";
export const DEBRIEF_V1 = "debrief@v1";
export const DEBRIEF_V2 = "debrief@v2";

export interface LegacyDebrief {
  readonly kind: "legacy";
  readonly version: typeof DEBRIEF_V0 | typeof DEBRIEF_V1;
  readonly missingTopLevel: readonly string[];
  readonly decisionsMissingBecause: number;
  readonly decisionsTotal: number;
}

export interface V2Debrief {
  readonly kind: "v2";
  readonly debrief: Debrief;
}

export type DebriefRead = LegacyDebrief | V2Debrief;

export type DebriefRefusal =
  | { readonly kind: "missing-file"; readonly path: string }
  | {
      readonly kind: "malformed-yaml";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "unknown-shape";
      readonly path: string;
      readonly tag: string | undefined;
    }
  | {
      readonly kind: "invalid-shape";
      readonly path: string;
      readonly reason: string;
    };

export function explainDebriefRefusal(refusal: DebriefRefusal): string {
  switch (refusal.kind) {
    case "missing-file":
      return `${refusal.path}: no such file.`;
    case "malformed-yaml":
      return `${refusal.path}: ${refusal.reason}`;
    case "unknown-shape":
      return `${refusal.path}: shape tag is ${refusal.tag === undefined ? "missing" : `"${refusal.tag}"`}, expected "${DEBRIEF_V0}", "${DEBRIEF_V1}" or "${DEBRIEF_V2}".`;
    case "invalid-shape":
      return `${refusal.path}: ${refusal.reason}`;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function invalid(path: string, reason: string): Result<never, DebriefRefusal> {
  return err({ kind: "invalid-shape", path, reason });
}

function requireShaField(
  parsed: Record<string, unknown>,
  field: string,
  path: string,
): Result<string, DebriefRefusal> {
  const value = prop(parsed, field);
  if (!isString(value)) return invalid(path, `"${field}" is missing or not a string`);
  if (!isShaLike(value)) return invalid(path, `"${field}" is not a 40-character SHA`);
  return ok(value);
}

function parseV2(
  parsed: Record<string, unknown>,
  path: string,
): Result<DebriefRead, DebriefRefusal> {
  const graph = prop(parsed, "graph");
  if (!isString(graph)) return invalid(path, '"graph" is missing or not a string');

  const node = prop(parsed, "node");
  if (!isString(node)) return invalid(path, '"node" is missing or not a string');

  const role = prop(parsed, "role");
  if (!isString(role)) return invalid(path, '"role" is missing or not a string');

  const graphBaseSha = requireShaField(parsed, "graph_base_sha", path);
  if (isErr(graphBaseSha)) return graphBaseSha;

  const sessionStartSha = requireShaField(parsed, "session_start_sha", path);
  if (isErr(sessionStartSha)) return sessionStartSha;

  const headSha = requireShaField(parsed, "head_sha", path);
  if (isErr(headSha)) return headSha;

  const derivation = prop(parsed, "derivation");
  if (!isDebriefDerivation(derivation)) return invalid(path, '"derivation" is missing or invalid');

  const rawDiscoveries = prop(parsed, "discoveries");
  if (!Array.isArray(rawDiscoveries)) return invalid(path, '"discoveries" must be a list');
  const discoveries = [];
  for (const [index, raw] of rawDiscoveries.entries()) {
    const parsedItem = parseDiscovery(raw, index);
    if (isErr(parsedItem)) return invalid(path, parsedItem.error);
    discoveries.push(parsedItem.value);
  }

  const rawDecisions = prop(parsed, "decisions");
  if (!Array.isArray(rawDecisions)) return invalid(path, '"decisions" must be a list');
  const decisions = [];
  for (const [index, raw] of rawDecisions.entries()) {
    const parsedItem = parseDecision(raw, index);
    if (isErr(parsedItem)) return invalid(path, parsedItem.error);
    decisions.push(parsedItem.value);
  }

  const rawGateRuns = prop(parsed, "gates_run_by_agent");
  if (!Array.isArray(rawGateRuns)) return invalid(path, '"gates_run_by_agent" must be a list');
  const gatesRunByAgent = [];
  for (const [index, raw] of rawGateRuns.entries()) {
    const parsedItem = parseGateRun(raw, index);
    if (isErr(parsedItem)) return invalid(path, parsedItem.error);
    gatesRunByAgent.push(parsedItem.value);
  }

  const open = prop(parsed, "open");
  if (!isStringArray(open)) return invalid(path, '"open" must be a list of strings');

  const rawDrafted = prop(parsed, "drafted");
  if (rawDrafted !== undefined && !isDrafted(rawDrafted))
    return invalid(path, '"drafted" must be a mapping with "by" and "from"');

  return ok({
    kind: "v2",
    debrief: {
      graph,
      node,
      role,
      graphBaseSha: graphBaseSha.value,
      sessionStartSha: sessionStartSha.value,
      headSha: headSha.value,
      derivation,
      discoveries,
      decisions,
      gatesRunByAgent,
      open,
      ...(rawDrafted === undefined ? {} : { drafted: rawDrafted }),
    },
  });
}

function requireItemsWithIdAndWhat(
  parsed: Record<string, unknown>,
  field: string,
  path: string,
): Result<readonly Record<string, unknown>[], DebriefRefusal> {
  const raw = prop(parsed, field);
  if (!Array.isArray(raw)) return invalid(path, `"${field}" must be a list`);
  const items: Record<string, unknown>[] = [];
  for (const [index, item] of raw.entries()) {
    if (!isRecord(item) || !isString(prop(item, "id")) || !isString(prop(item, "what")))
      return invalid(path, `${field} ${index}: "id" and "what" are required`);
    items.push(item);
  }
  return ok(items);
}

function parseLegacy(
  parsed: Record<string, unknown>,
  version: typeof DEBRIEF_V0 | typeof DEBRIEF_V1,
  path: string,
): Result<DebriefRead, DebriefRefusal> {
  const graph = prop(parsed, "graph");
  if (!isString(graph)) return invalid(path, '"graph" is missing or not a string');

  const node = prop(parsed, "node");
  if (!isString(node)) return invalid(path, '"node" is missing or not a string');

  const missingTopLevel: string[] = [];
  if (version === DEBRIEF_V0) {
    const baseSha = requireShaField(parsed, "base_sha", path);
    if (isErr(baseSha)) return baseSha;
    missingTopLevel.push("role", "session_start_sha");
  } else {
    const role = prop(parsed, "role");
    if (!isString(role)) return invalid(path, '"role" is missing or not a string');
    const graphBaseSha = requireShaField(parsed, "graph_base_sha", path);
    if (isErr(graphBaseSha)) return graphBaseSha;
    const sessionStartSha = requireShaField(parsed, "session_start_sha", path);
    if (isErr(sessionStartSha)) return sessionStartSha;
  }

  const headSha = requireShaField(parsed, "head_sha", path);
  if (isErr(headSha)) return headSha;

  const derivation = prop(parsed, "derivation");
  if (!isDebriefDerivation(derivation)) return invalid(path, '"derivation" is missing or invalid');

  const discoveries = requireItemsWithIdAndWhat(parsed, "discoveries", path);
  if (isErr(discoveries)) return discoveries;

  const decisions = requireItemsWithIdAndWhat(parsed, "decisions", path);
  if (isErr(decisions)) return decisions;
  const decisionsMissingBecause = decisions.value.filter(
    (decision) => !isString(prop(decision, "because")),
  ).length;

  const gateRuns = prop(parsed, "gates_run_by_agent");
  if (!Array.isArray(gateRuns)) return invalid(path, '"gates_run_by_agent" must be a list');
  for (const [index, raw] of gateRuns.entries()) {
    if (!isRecord(raw) || !isString(prop(raw, "id")))
      return invalid(path, `gate run ${index}: "id" is required`);
  }

  const open = prop(parsed, "open");
  if (!isStringArray(open)) return invalid(path, '"open" must be a list of strings');

  return ok({
    kind: "legacy",
    version,
    missingTopLevel,
    decisionsMissingBecause,
    decisionsTotal: decisions.value.length,
  });
}

export async function readDebriefFile(path: string): Promise<Result<DebriefRead, DebriefRefusal>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return err({ kind: "missing-file", path });
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed-yaml", path, reason });
  }

  if (!isRecord(parsed)) return invalid(path, "the document is not a YAML mapping");

  const tag = shapeTag(parsed);
  switch (tag) {
    case DEBRIEF_V0:
      return parseLegacy(parsed, DEBRIEF_V0, path);
    case DEBRIEF_V1:
      return parseLegacy(parsed, DEBRIEF_V1, path);
    case DEBRIEF_V2:
      return parseV2(parsed, path);
    default:
      return err({ kind: "unknown-shape", path, tag });
  }
}
