import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { AGENT_NAME_SHAPE_DESCRIPTION, isCompliantAgentName } from "./agentName.ts";
import {
  DEFAULT_PROMPT_RETRIES,
  DEFAULT_PROMPT_TAKEN_TIMEOUT_MS,
  DEFAULT_READY_SETTLE_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  type LocalConfig,
} from "./localConfig.ts";
import { parseStartupAnswers, type StartupAnswer } from "./startupAnswers.ts";
import { isNonNegativeInteger, isRecord, isString, isStringArray, prop } from "./validate.ts";

export const RUNTIME_CATALOGUE_SHAPE = "runtimes@v0";

export const DEFAULT_RUNTIME_NAME = "default";

export interface CatalogueRuntime {
  readonly kind: string;
  readonly args: readonly string[];
  readonly model: string;
  readonly startupAnswers: readonly StartupAnswer[];
  readonly startupTimeoutMs: number;
  readonly promptTakenTimeoutMs: number | undefined;
  readonly readySettleMs: number;
  readonly promptRetries: number;
}

export type RuntimeCatalogueRefusal =
  | {
      readonly kind: "malformed";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "unreadable";
      readonly path: string;
      readonly code: string;
    };

export function explainRuntimeCatalogueRefusal(refusal: RuntimeCatalogueRefusal): string {
  switch (refusal.kind) {
    case "malformed":
      return `${refusal.path}: ${refusal.reason}`;
    case "unreadable":
      return `${refusal.path}: cannot be read (${refusal.code}).`;
  }
}

export function runtimeCataloguePath(): string {
  const override = process.env["INTERLOCK_RUNTIMES"];
  if (override !== undefined && override !== "") return override;
  const xdgConfigHome = process.env["XDG_CONFIG_HOME"];
  const configHome =
    xdgConfigHome !== undefined && xdgConfigHome !== ""
      ? xdgConfigHome
      : join(homedir(), ".config");
  return join(configHome, "interlock", "runtimes.yaml");
}

const KNOWN_ENTRY_KEYS: ReadonlySet<string> = new Set([
  "kind",
  "args",
  "model",
  "startup_answers",
  "startup_timeout_ms",
  "prompt_taken_timeout_ms",
  "ready_settle_ms",
  "prompt_retries",
]);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function parseEntry(
  name: string,
  value: unknown,
  path: string,
): Result<CatalogueRuntime, RuntimeCatalogueRefusal> {
  if (!isRecord(value)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}" is not a mapping`,
    });
  }
  for (const key of Object.keys(value)) {
    if (!KNOWN_ENTRY_KEYS.has(key)) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtimes.${name}" has an unknown key "${key}"`,
      });
    }
  }

  const kind = prop(value, "kind");
  if (!isString(kind)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.kind" is missing or not a string`,
    });
  }

  const args = prop(value, "args");
  if (args !== undefined && !isStringArray(args)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.args" must be a list of strings`,
    });
  }

  const model = prop(value, "model");
  if (!isString(model)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.model" is missing or not a string`,
    });
  }

  const startupAnswers = parseStartupAnswers(
    prop(value, "startup_answers"),
    `runtimes.${name}.startup_answers`,
  );
  if (isErr(startupAnswers)) {
    return err({ kind: "malformed", path, reason: startupAnswers.error });
  }

  const startupTimeoutMsField = prop(value, "startup_timeout_ms");
  if (startupTimeoutMsField !== undefined && !isPositiveInteger(startupTimeoutMsField)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.startup_timeout_ms" must be a positive integer`,
    });
  }

  const promptTakenTimeoutMsField = prop(value, "prompt_taken_timeout_ms");
  if (promptTakenTimeoutMsField !== undefined && !isPositiveInteger(promptTakenTimeoutMsField)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.prompt_taken_timeout_ms" must be a positive integer`,
    });
  }

  const readySettleMsField = prop(value, "ready_settle_ms");
  if (readySettleMsField !== undefined && !isNonNegativeInteger(readySettleMsField)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.ready_settle_ms" must be a non-negative integer`,
    });
  }

  const promptRetriesField = prop(value, "prompt_retries");
  if (promptRetriesField !== undefined && !isNonNegativeInteger(promptRetriesField)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.prompt_retries" must be a non-negative integer`,
    });
  }

  return ok({
    kind,
    args: args ?? [],
    model,
    startupAnswers: startupAnswers.value,
    startupTimeoutMs: startupTimeoutMsField ?? DEFAULT_STARTUP_TIMEOUT_MS,
    promptTakenTimeoutMs: promptTakenTimeoutMsField,
    readySettleMs: readySettleMsField ?? DEFAULT_READY_SETTLE_MS,
    promptRetries: promptRetriesField ?? DEFAULT_PROMPT_RETRIES,
  });
}

function parseDocument(
  parsed: unknown,
  path: string,
): Result<ReadonlyMap<string, CatalogueRuntime>, RuntimeCatalogueRefusal> {
  if (!isRecord(parsed)) {
    return err({
      kind: "malformed",
      path,
      reason: "the document is not a YAML mapping",
    });
  }
  const tag = prop(parsed, "interlock");
  if (tag !== RUNTIME_CATALOGUE_SHAPE) {
    return err({
      kind: "malformed",
      path,
      reason: `shape tag is ${isString(tag) ? `"${tag}"` : "missing"}, expected "${RUNTIME_CATALOGUE_SHAPE}"`,
    });
  }

  const runtimesField = prop(parsed, "runtimes");
  if (runtimesField === undefined) return ok(new Map());
  if (!isRecord(runtimesField)) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtimes" must be a mapping',
    });
  }

  const runtimes = new Map<string, CatalogueRuntime>();
  for (const [name, value] of Object.entries(runtimesField)) {
    if (!isCompliantAgentName(name)) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtimes.${name}" is not a valid runtime name; expected ${AGENT_NAME_SHAPE_DESCRIPTION}`,
      });
    }
    const entry = parseEntry(name, value, path);
    if (isErr(entry)) return entry;
    runtimes.set(name, entry.value);
  }
  return ok(runtimes);
}

export async function loadRuntimeCatalogue(
  path: string = runtimeCataloguePath(),
): Promise<Result<ReadonlyMap<string, CatalogueRuntime>, RuntimeCatalogueRefusal>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return ok(new Map());
    const code = isNodeError(error) && error.code !== undefined ? error.code : "unknown error";
    return err({ kind: "unreadable", path, code });
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason = error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed", path, reason });
  }

  return parseDocument(parsed, path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

export interface ResolvedRuntime {
  readonly name: string;
  readonly kind: string;
  readonly args: readonly string[];
  readonly model: string | undefined;
  readonly startupAnswers: readonly StartupAnswer[];
  readonly startupTimeoutMs: number;
  readonly promptTakenTimeoutMs: number;
  readonly readySettleMs: number;
  readonly promptRetries: number;
  readonly source: "catalogue" | "local.yaml";
}

export type MergeRuntimesRefusal =
  | { readonly kind: "duplicate-default" }
  | {
      readonly kind: "unknown-default-runtime";
      readonly name: string;
      readonly known: readonly string[];
    };

export function explainMergeRuntimesRefusal(refusal: MergeRuntimesRefusal): string {
  switch (refusal.kind) {
    case "duplicate-default":
      return `"${DEFAULT_RUNTIME_NAME}" is declared both in the runtime catalogue and as local.yaml's runtime block; remove one.`;
    case "unknown-default-runtime": {
      const known = refusal.known.length === 0 ? "(none)" : refusal.known.join(", ");
      return `local.yaml's default_runtime names "${refusal.name}", which is not a known runtime; known runtimes are ${known}.`;
    }
  }
}

export interface MergedRuntimes {
  readonly runtimes: ReadonlyMap<string, ResolvedRuntime>;
  readonly defaultRuntime: string | undefined;
}

export function mergeRuntimes(
  catalogue: ReadonlyMap<string, CatalogueRuntime>,
  local: LocalConfig | undefined,
): Result<MergedRuntimes, MergeRuntimesRefusal> {
  const runtimes = new Map<string, ResolvedRuntime>();
  for (const [name, entry] of catalogue) {
    runtimes.set(name, {
      name,
      kind: entry.kind,
      args: entry.args,
      model: entry.model,
      startupAnswers: entry.startupAnswers,
      startupTimeoutMs: entry.startupTimeoutMs,
      promptTakenTimeoutMs:
        entry.promptTakenTimeoutMs ??
        local?.runtime.promptTakenTimeoutMs ??
        DEFAULT_PROMPT_TAKEN_TIMEOUT_MS,
      readySettleMs: entry.readySettleMs,
      promptRetries: entry.promptRetries,
      source: "catalogue",
    });
  }

  if (local !== undefined) {
    if (runtimes.has(DEFAULT_RUNTIME_NAME)) {
      return err({ kind: "duplicate-default" });
    }
    runtimes.set(DEFAULT_RUNTIME_NAME, {
      name: DEFAULT_RUNTIME_NAME,
      kind: local.runtime.kind,
      args: local.runtime.args,
      model: undefined,
      startupAnswers: local.runtime.startupAnswers,
      startupTimeoutMs: local.runtime.startupTimeoutMs,
      promptTakenTimeoutMs: local.runtime.promptTakenTimeoutMs,
      readySettleMs: local.runtime.readySettleMs,
      promptRetries: local.runtime.promptRetries,
      source: "local.yaml",
    });
  }

  const defaultRuntime = local?.defaultRuntime;
  if (defaultRuntime !== undefined && !runtimes.has(defaultRuntime)) {
    return err({
      kind: "unknown-default-runtime",
      name: defaultRuntime,
      known: [...runtimes.keys()],
    });
  }

  return ok({ runtimes, defaultRuntime });
}
