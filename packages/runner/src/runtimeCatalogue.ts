import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { ChosenBy } from "ledger";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { AGENT_NAME_SHAPE_DESCRIPTION, isCompliantAgentName } from "./agentName.ts";
import {
  DEFAULT_PROMPT_RETRIES,
  DEFAULT_PROMPT_TAKEN_TIMEOUT_MS,
  DEFAULT_READY_SETTLE_MS,
  DEFAULT_STARTUP_TIMEOUT_MS,
  type LocalConfig,
} from "./localConfig.ts";
import { RUNNER_MARKER_KEYS } from "./runnerMarker.ts";
import { parseStartupAnswers, type StartupAnswer } from "./startupAnswers.ts";
import { isNonNegativeInteger, isRecord, isString, isStringArray, prop } from "./validate.ts";
import {
  expandWritableRootArgs,
  parseArgumentTemplate,
  parseProbeExec,
  parseWritableRootArgs,
  type WritableRootTemplate,
} from "./writableRootArgs.ts";

export const RUNTIME_CATALOGUE_SHAPE = "runtimes@v2";

export const DEFAULT_RUNTIME_NAME = "default";

export type CommitMode = "runner" | "agent";

export interface CatalogueRuntime {
  readonly commits: CommitMode;
  readonly provider?: string;
  readonly routable?: true;
  readonly kind: string;
  readonly args: readonly string[];
  readonly model: string;
  readonly startupAnswers: readonly StartupAnswer[];
  readonly startupTimeoutMs: number;
  readonly promptTakenTimeoutMs: number | undefined;
  readonly readySettleMs: number;
  readonly promptRetries: number;
  readonly writableRootArgs: WritableRootTemplate | undefined;
  readonly exec?: WritableRootTemplate;
  readonly readOnlyArgs?: readonly string[];
  readonly mcpServers?: readonly string[];
  readonly mcpAllow?: readonly string[];
  readonly mcpDisableArgs?: readonly string[];
  readonly mcpExclusive?: McpExclusiveTemplate;
  readonly environmentPassthrough?: readonly string[];
  readonly environmentForwardArgs?: WritableRootTemplate;
  readonly prompt?: "stdin";
}

export interface McpExclusiveTemplate {
  readonly disableAll: readonly string[];
  readonly allowEach: WritableRootTemplate;
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
  "commits",
  "provider",
  "routable",
  "kind",
  "args",
  "model",
  "startup_answers",
  "startup_timeout_ms",
  "prompt_taken_timeout_ms",
  "ready_settle_ms",
  "prompt_retries",
  "writable_root_args",
  "exec",
  "read_only_args",
  "mcp_servers",
  "mcp_allow",
  "mcp_disable_args",
  "mcp_exclusive",
  "environment_passthrough",
  "environment_forward_args",
  "prompt",
]);

const WRITABLE_ROOTS_PLACEHOLDER = "{writable_roots}";
const NAME_PLACEHOLDER = "{name}";
const RUNNER_MARKER_NAME_SET: ReadonlySet<string> = new Set(RUNNER_MARKER_KEYS);

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isTemplate(value: unknown, placeholder: string): value is readonly string[] {
  return (
    isStringArray(value) &&
    value.length > 0 &&
    value.every((part) => !part.includes("\0")) &&
    value.filter((part) => part === placeholder).length === 1
  );
}

function isServerNames(value: unknown): value is readonly string[] {
  return (
    isStringArray(value) &&
    value.every((name) => name.length > 0 && !name.includes("\0") && !/\s/.test(name)) &&
    new Set(value).size === value.length
  );
}

function isEnvironmentNames(value: unknown): value is readonly string[] {
  return (
    isStringArray(value) &&
    value.every((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) &&
    new Set(value).size === value.length
  );
}

function parseMcpExclusive(
  value: unknown,
  fieldPath: string,
): Result<McpExclusiveTemplate | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (!isRecord(value)) return err(`"${fieldPath}" must be a mapping`);
  const disableAll = prop(value, "disable_all");
  if (!isStringArray(disableAll) || disableAll.length === 0) {
    return err(`"${fieldPath}.disable_all" must be a nonempty list of strings`);
  }
  const allowEach = parseArgumentTemplate(
    prop(value, "allow_each"),
    `${fieldPath}.allow_each`,
    NAME_PLACEHOLDER,
  );
  if (isErr(allowEach)) return err(allowEach.error);
  if (allowEach.value === undefined) {
    return err(
      `"${fieldPath}.allow_each" must be a list with one whole "${NAME_PLACEHOLDER}" element`,
    );
  }
  for (const key of Object.keys(value)) {
    if (key !== "disable_all" && key !== "allow_each") {
      return err(`"${fieldPath}" has an unknown key "${key}"`);
    }
  }
  return ok({ disableAll, allowEach: allowEach.value });
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

  const provider = prop(value, "provider");
  const routable = prop(value, "routable");
  if (provider !== undefined && (!isString(provider) || provider.trim() === "")) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.provider" must be a nonempty string`,
    });
  }
  if (routable !== undefined && routable !== true) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.routable" must be true when present`,
    });
  }
  if (routable === true && provider === undefined) {
    return err({ kind: "malformed", path, reason: `"runtimes.${name}.routable" needs provider` });
  }

  const commitsField = prop(value, "commits");
  const commits = commitsField === undefined ? "agent" : commitsField;
  if (commits !== "agent" && commits !== "runner") {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.commits" must be runner or agent`,
    });
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

  const writableRootArgs = parseWritableRootArgs(
    prop(value, "writable_root_args"),
    `runtimes.${name}.writable_root_args`,
  );
  if (isErr(writableRootArgs)) {
    return err({ kind: "malformed", path, reason: writableRootArgs.error });
  }
  const exec = parseProbeExec(prop(value, "exec"), `runtimes.${name}.exec`);
  if (isErr(exec)) return err({ kind: "malformed", path, reason: exec.error });

  const readOnlyArgs = prop(value, "read_only_args");
  if (readOnlyArgs !== undefined && !isStringArray(readOnlyArgs)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.read_only_args" must be a list of strings`,
    });
  }
  const mcpServers = prop(value, "mcp_servers");
  if (mcpServers !== undefined && !isServerNames(mcpServers)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.mcp_servers" must be a list of distinct nonempty names`,
    });
  }
  const mcpAllow = prop(value, "mcp_allow");
  if (mcpAllow !== undefined && !isServerNames(mcpAllow)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.mcp_allow" must be a list of distinct nonempty names`,
    });
  }
  const mcpDisableArgs = prop(value, "mcp_disable_args");
  if (mcpDisableArgs !== undefined && !isTemplate(mcpDisableArgs, "{name}")) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.mcp_disable_args" must contain exactly one whole "{name}" element`,
    });
  }
  const mcpExclusive = parseMcpExclusive(
    prop(value, "mcp_exclusive"),
    `runtimes.${name}.mcp_exclusive`,
  );
  if (isErr(mcpExclusive)) return err({ kind: "malformed", path, reason: mcpExclusive.error });
  const environmentPassthrough = prop(value, "environment_passthrough");
  if (environmentPassthrough !== undefined && !isEnvironmentNames(environmentPassthrough)) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.environment_passthrough" must be a list of distinct valid variable names`,
    });
  }
  const environmentForwardArgs = parseArgumentTemplate(
    prop(value, "environment_forward_args"),
    `runtimes.${name}.environment_forward_args`,
    NAME_PLACEHOLDER,
  );
  if (isErr(environmentForwardArgs)) {
    return err({ kind: "malformed", path, reason: environmentForwardArgs.error });
  }
  const forwardedMarker = environmentPassthrough?.find((name) => RUNNER_MARKER_NAME_SET.has(name));
  if (forwardedMarker !== undefined) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.environment_passthrough" cannot forward interlock marker "${forwardedMarker}"`,
    });
  }
  if (mcpExclusive.value !== undefined && mcpDisableArgs !== undefined) {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}" cannot combine mcp_exclusive with mcp_disable_args`,
    });
  }
  const prompt = prop(value, "prompt");
  if (prompt !== undefined && prompt !== "stdin") {
    return err({
      kind: "malformed",
      path,
      reason: `"runtimes.${name}.prompt" must be "stdin"`,
    });
  }
  if (kind === "exec") {
    if (!isStringArray(args) || args.length === 0) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtimes.${name}.args" must be a nonempty list for kind exec`,
      });
    }
    const hasPromptArg = args.some((part) => part === "{prompt}");
    if (!hasPromptArg && prompt !== "stdin") {
      return err({
        kind: "malformed",
        path,
        reason: `"runtimes.${name}" needs a whole "{prompt}" args element or prompt: stdin`,
      });
    }
    const writableRoots = args.filter((part) => part === WRITABLE_ROOTS_PLACEHOLDER);
    const embeddedWritableRoots = args.find(
      (part) => part !== WRITABLE_ROOTS_PLACEHOLDER && part.includes(WRITABLE_ROOTS_PLACEHOLDER),
    );
    if (writableRoots.length > 1 || embeddedWritableRoots !== undefined) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtimes.${name}.args" must contain at most one whole "${WRITABLE_ROOTS_PLACEHOLDER}" element`,
      });
    }
    if (mcpAllow !== undefined) {
      const servers = new Set(mcpServers ?? []);
      const outside = mcpAllow.find((name) => !servers.has(name));
      if (outside !== undefined) {
        return err({
          kind: "malformed",
          path,
          reason: `"runtimes.${name}.mcp_allow" names server "${outside}" not in mcp_servers`,
        });
      }
    }
  }

  return ok({
    ...(provider === undefined ? {} : { provider }),
    ...(routable === true ? { routable } : {}),
    commits,
    kind,
    args: args ?? [],
    model,
    startupAnswers: startupAnswers.value,
    startupTimeoutMs: startupTimeoutMsField ?? DEFAULT_STARTUP_TIMEOUT_MS,
    promptTakenTimeoutMs: promptTakenTimeoutMsField,
    readySettleMs: readySettleMsField ?? DEFAULT_READY_SETTLE_MS,
    promptRetries: promptRetriesField ?? DEFAULT_PROMPT_RETRIES,
    writableRootArgs: writableRootArgs.value,
    ...(exec.value === undefined ? {} : { exec: exec.value }),
    ...(readOnlyArgs === undefined ? {} : { readOnlyArgs }),
    ...(mcpServers === undefined ? {} : { mcpServers }),
    ...(mcpAllow === undefined ? {} : { mcpAllow }),
    ...(mcpDisableArgs === undefined ? {} : { mcpDisableArgs }),
    ...(mcpExclusive.value === undefined ? {} : { mcpExclusive: mcpExclusive.value }),
    ...(environmentPassthrough === undefined ? {} : { environmentPassthrough }),
    ...(environmentForwardArgs.value === undefined
      ? {}
      : { environmentForwardArgs: environmentForwardArgs.value }),
    ...(prompt === undefined ? {} : { prompt }),
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
  if (tag !== "runtimes@v0" && tag !== "runtimes@v1" && tag !== RUNTIME_CATALOGUE_SHAPE) {
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
  const routableProviders = new Map<string, string>();
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
    if (entry.value.routable === true && entry.value.provider !== undefined) {
      const previous = routableProviders.get(entry.value.provider);
      if (previous !== undefined) {
        return err({
          kind: "malformed",
          path,
          reason: `provider "${entry.value.provider}" has two routable profiles: "${previous}" and "${name}"`,
        });
      }
      routableProviders.set(entry.value.provider, name);
    }
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
  readonly commits: CommitMode;
  readonly name: string;
  readonly provider?: string;
  readonly routable?: true;
  readonly kind: string;
  readonly args: readonly string[];
  readonly model: string | undefined;
  readonly startupAnswers: readonly StartupAnswer[];
  readonly startupTimeoutMs: number;
  readonly promptTakenTimeoutMs: number;
  readonly readySettleMs: number;
  readonly promptRetries: number;
  readonly writableRootArgs: WritableRootTemplate | undefined;
  readonly exec?: WritableRootTemplate;
  readonly readOnlyArgs?: readonly string[];
  readonly mcpServers?: readonly string[];
  readonly mcpAllow?: readonly string[];
  readonly mcpDisableArgs?: readonly string[];
  readonly mcpExclusive?: McpExclusiveTemplate;
  readonly environmentPassthrough?: readonly string[];
  readonly environmentForwardArgs?: WritableRootTemplate;
  readonly prompt?: "stdin";
  readonly source: "catalogue" | "local.yaml";
  readonly chosenBy?: ChosenBy;
}

export function execRuntimeArgv(
  runtime: Pick<
    ResolvedRuntime,
    | "args"
    | "readOnlyArgs"
    | "mcpServers"
    | "mcpAllow"
    | "mcpDisableArgs"
    | "mcpExclusive"
    | "environmentPassthrough"
    | "environmentForwardArgs"
  > & { readonly writableRootArgs?: WritableRootTemplate | undefined },
  prompt: string,
  review = false,
  options: {
    readonly writableRoots?: readonly string[];
    readonly environment?: Readonly<Record<string, string | undefined>>;
  } = {},
): readonly string[] {
  const writableRoots = options.writableRoots ?? [];
  const writableRootArgs = runtime.writableRootArgs;
  const args = runtime.args.flatMap((part) => {
    if (part === "{prompt}") return [prompt];
    if (part === WRITABLE_ROOTS_PLACEHOLDER && writableRootArgs !== undefined) {
      return writableRoots.flatMap((root) => expandWritableRootArgs(writableRootArgs, root));
    }
    if (part === WRITABLE_ROOTS_PLACEHOLDER) return [];
    return [part];
  });
  const readOnly = review ? (runtime.readOnlyArgs ?? []) : [];
  const servers = runtime.mcpServers ?? [];
  const allow = review ? (runtime.mcpAllow ?? []) : (runtime.mcpAllow ?? servers);
  const disabled = servers.filter((name) => !allow.includes(name));
  const mcp =
    runtime.mcpExclusive === undefined
      ? (runtime.mcpDisableArgs ?? []).flatMap((part) =>
          disabled.map((name) => part.replace(NAME_PLACEHOLDER, name)),
        )
      : [
          ...runtime.mcpExclusive.disableAll,
          ...allow.flatMap((name) =>
            runtime.mcpExclusive === undefined
              ? []
              : expandWritableRootArgs(runtime.mcpExclusive.allowEach, name),
          ),
        ];
  const forwarded = (runtime.environmentPassthrough ?? [])
    .filter((name) => options.environment?.[name] !== undefined)
    .flatMap((name) =>
      runtime.environmentForwardArgs === undefined
        ? []
        : expandWritableRootArgs(runtime.environmentForwardArgs, name),
    );
  return [...args, ...readOnly, ...mcp, ...forwarded];
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
      ...(entry.provider === undefined ? {} : { provider: entry.provider }),
      ...(entry.routable === undefined ? {} : { routable: entry.routable }),
      commits: entry.commits,
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
      writableRootArgs: entry.writableRootArgs,
      ...(entry.exec === undefined ? {} : { exec: entry.exec }),
      ...(entry.readOnlyArgs === undefined ? {} : { readOnlyArgs: entry.readOnlyArgs }),
      ...(entry.mcpServers === undefined ? {} : { mcpServers: entry.mcpServers }),
      ...(entry.mcpAllow === undefined ? {} : { mcpAllow: entry.mcpAllow }),
      ...(entry.mcpDisableArgs === undefined ? {} : { mcpDisableArgs: entry.mcpDisableArgs }),
      ...(entry.mcpExclusive === undefined ? {} : { mcpExclusive: entry.mcpExclusive }),
      ...(entry.environmentPassthrough === undefined
        ? {}
        : { environmentPassthrough: entry.environmentPassthrough }),
      ...(entry.environmentForwardArgs === undefined
        ? {}
        : { environmentForwardArgs: entry.environmentForwardArgs }),
      ...(entry.prompt === undefined ? {} : { prompt: entry.prompt }),
      source: "catalogue",
    });
  }

  if (local !== undefined) {
    if (runtimes.has(DEFAULT_RUNTIME_NAME)) {
      return err({ kind: "duplicate-default" });
    }
    runtimes.set(DEFAULT_RUNTIME_NAME, {
      name: DEFAULT_RUNTIME_NAME,
      commits: "agent",
      kind: local.runtime.kind,
      args: local.runtime.args,
      model: undefined,
      startupAnswers: local.runtime.startupAnswers,
      startupTimeoutMs: local.runtime.startupTimeoutMs,
      promptTakenTimeoutMs: local.runtime.promptTakenTimeoutMs,
      readySettleMs: local.runtime.readySettleMs,
      promptRetries: local.runtime.promptRetries,
      writableRootArgs: local.runtime.writableRootArgs,
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
