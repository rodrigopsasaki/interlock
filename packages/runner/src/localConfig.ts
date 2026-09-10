import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml, YAMLParseError } from "yaml";
import {
  isValidStartupAnswerMatcher,
  type StartupAnswer,
} from "./startupAnswers.ts";
import { isRecord, isString, prop } from "./validate.ts";

export const LOCAL_CONFIG_SHAPE = "local@v0";

const DEFAULT_STARTUP_TIMEOUT_MS = 60_000;
const DEFAULT_PROMPT_TAKEN_TIMEOUT_MS = 20_000;

export interface LocalConfig {
  readonly runtime: {
    readonly kind: string;
    readonly args: readonly string[];
    readonly startupAnswers: readonly StartupAnswer[];
    readonly startupTimeoutMs: number;
    readonly promptTakenTimeoutMs: number;
  };
  readonly worktreeRoot: string;
  readonly worktreeSetup: readonly string[];
  readonly leaseMs: number;
  readonly runTimeoutMs: number;
  readonly substrateAddress: string;
}

export type LocalConfigRefusal =
  | { readonly kind: "missing"; readonly path: string }
  | {
      readonly kind: "malformed";
      readonly path: string;
      readonly reason: string;
    };

const FIELD_GUIDE =
  'runtime.kind (the agent CLI to start, e.g. "claude"), runtime.args (its extra arguments), ' +
  "runtime.startup_answers (optional; keys to send when the runtime blocks at startup), " +
  "runtime.startup_timeout_ms (optional; how long to wait for the runtime to become ready " +
  "before sending the opening prompt), " +
  "runtime.prompt_taken_timeout_ms (optional; how long to wait after the opening prompt for " +
  "the agent to move off idle before the long wait judges it), " +
  "worktree_root (where node worktrees are created, relative to the repository root), " +
  "worktree_setup (optional; commands run in a node's worktree before its pane opens), " +
  "lease_ms (how long a lease lasts before a sweep may call it abandoned), " +
  "run_timeout_ms (the wall timeout waiting for the agent to go idle, blocked or done), " +
  "substrate.address (unused by this node, present so the shape is one).";

export function explainLocalConfigRefusal(refusal: LocalConfigRefusal): string {
  switch (refusal.kind) {
    case "missing":
      return `${refusal.path}: no local configuration; copy .interlock/local.example.yaml and fill in ${FIELD_GUIDE}`;
    case "malformed":
      return `${refusal.path}: ${refusal.reason}`;
  }
}

export function localConfigPath(repoRoot: string): string {
  return join(repoRoot, ".interlock", "local.yaml");
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

function parseStartupAnswers(
  value: unknown,
  path: string,
): Result<readonly StartupAnswer[], LocalConfigRefusal> {
  if (value === undefined) return ok([]);
  if (!Array.isArray(value)) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtime.startup_answers" must be a list',
    });
  }

  const answers: StartupAnswer[] = [];
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtime.startup_answers[${index}]" is not a mapping`,
      });
    }
    const matches = prop(entry, "matches");
    if (!isString(matches) || !isValidStartupAnswerMatcher(matches)) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtime.startup_answers[${index}].matches" must be a string or a valid /regex/`,
      });
    }
    const keys = prop(entry, "keys");
    if (!isStringArray(keys) || keys.length === 0) {
      return err({
        kind: "malformed",
        path,
        reason: `"runtime.startup_answers[${index}].keys" must be a non-empty list of strings`,
      });
    }
    answers.push({ matches, keys });
  }
  return ok(answers);
}

function parseShape(
  parsed: unknown,
  path: string,
): Result<LocalConfig, LocalConfigRefusal> {
  if (!isRecord(parsed)) {
    return err({
      kind: "malformed",
      path,
      reason: "the document is not a YAML mapping",
    });
  }
  const tag = prop(parsed, "interlock");
  if (tag !== LOCAL_CONFIG_SHAPE) {
    return err({
      kind: "malformed",
      path,
      reason: `shape tag is ${isString(tag) ? `"${tag}"` : "missing"}, expected "${LOCAL_CONFIG_SHAPE}"`,
    });
  }

  const runtime = prop(parsed, "runtime");
  const runtimeKind = isRecord(runtime) ? prop(runtime, "kind") : undefined;
  if (!isString(runtimeKind)) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtime.kind" is missing or not a string',
    });
  }
  const runtimeArgs = isRecord(runtime) ? prop(runtime, "args") : undefined;
  if (runtimeArgs !== undefined && !isStringArray(runtimeArgs)) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtime.args" must be a list of strings',
    });
  }
  const startupAnswers = parseStartupAnswers(
    isRecord(runtime) ? prop(runtime, "startup_answers") : undefined,
    path,
  );
  if (isErr(startupAnswers)) return startupAnswers;

  const startupTimeoutMsField = isRecord(runtime)
    ? prop(runtime, "startup_timeout_ms")
    : undefined;
  if (
    startupTimeoutMsField !== undefined &&
    typeof startupTimeoutMsField !== "number"
  ) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtime.startup_timeout_ms" must be a number',
    });
  }
  const startupTimeoutMs = startupTimeoutMsField ?? DEFAULT_STARTUP_TIMEOUT_MS;

  const promptTakenTimeoutMsField = isRecord(runtime)
    ? prop(runtime, "prompt_taken_timeout_ms")
    : undefined;
  if (
    promptTakenTimeoutMsField !== undefined &&
    typeof promptTakenTimeoutMsField !== "number"
  ) {
    return err({
      kind: "malformed",
      path,
      reason: '"runtime.prompt_taken_timeout_ms" must be a number',
    });
  }
  const promptTakenTimeoutMs =
    promptTakenTimeoutMsField ?? DEFAULT_PROMPT_TAKEN_TIMEOUT_MS;

  const worktreeRoot = prop(parsed, "worktree_root");
  if (!isString(worktreeRoot)) {
    return err({
      kind: "malformed",
      path,
      reason: '"worktree_root" is missing or not a string',
    });
  }

  const worktreeSetupField = prop(parsed, "worktree_setup");
  if (worktreeSetupField !== undefined && !isStringArray(worktreeSetupField)) {
    return err({
      kind: "malformed",
      path,
      reason: '"worktree_setup" must be a list of strings',
    });
  }
  const worktreeSetup = worktreeSetupField ?? [];

  const leaseMs = prop(parsed, "lease_ms");
  if (typeof leaseMs !== "number") {
    return err({
      kind: "malformed",
      path,
      reason: '"lease_ms" is missing or not a number',
    });
  }

  const runTimeoutMs = prop(parsed, "run_timeout_ms");
  if (typeof runTimeoutMs !== "number") {
    return err({
      kind: "malformed",
      path,
      reason: '"run_timeout_ms" is missing or not a number',
    });
  }

  const substrate = prop(parsed, "substrate");
  const substrateAddress = isRecord(substrate)
    ? prop(substrate, "address")
    : undefined;
  if (!isString(substrateAddress)) {
    return err({
      kind: "malformed",
      path,
      reason: '"substrate.address" is missing or not a string',
    });
  }

  return ok({
    runtime: {
      kind: runtimeKind,
      args: runtimeArgs ?? [],
      startupAnswers: startupAnswers.value,
      startupTimeoutMs,
      promptTakenTimeoutMs,
    },
    worktreeRoot,
    worktreeSetup,
    leaseMs,
    runTimeoutMs,
    substrateAddress,
  });
}

export async function loadLocalConfig(
  repoRoot: string,
): Promise<Result<LocalConfig, LocalConfigRefusal>> {
  const path = localConfigPath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return err({ kind: "missing", path });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason =
      error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed", path, reason });
  }

  return parseShape(parsed, path);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
