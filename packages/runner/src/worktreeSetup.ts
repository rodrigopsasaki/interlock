import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { parse as parseYaml } from "yaml";
import {
  checkNodeEngine,
  explainNodeEngineRefusal,
  type NodeEngineRefusal,
  type NodeVersionRunner,
} from "./nodeEngine.ts";
import { nonInteractiveEnvironment, runOwnedCommandWithTimeout } from "./ownedCommand.ts";

export const SETUP_LOG_TAIL_BYTES = 64 * 1024;
export const DEFAULT_WORKTREE_SETUP_HOLD_TIMEOUT_MS = 20 * 60 * 1000;

export type WorktreeSetupExit =
  | { readonly kind: "exit"; readonly code: number }
  | { readonly kind: "signal"; readonly signal: string };

export type WorktreeSetupRefusal =
  | {
      readonly kind: "command-failed";
      readonly command: string;
      readonly exit: WorktreeSetupExit;
      readonly tail: string;
      readonly logPath?: string;
      readonly timeoutMs?: number;
    }
  | NodeEngineRefusal;

function describeExit(exit: WorktreeSetupExit): string {
  return exit.kind === "exit" ? `exited ${exit.code}` : `was killed by ${exit.signal}`;
}

export function explainWorktreeSetupRefusal(refusal: WorktreeSetupRefusal): string {
  if (refusal.kind === "node-engine") return explainNodeEngineRefusal(refusal);
  const header =
    refusal.timeoutMs === undefined
      ? `"${refusal.command}" ${describeExit(refusal.exit)}.`
      : `"${refusal.command}" timed out after ${refusal.timeoutMs}ms.`;
  const tail = refusal.tail.length === 0 ? "" : `\n${refusal.tail}`;
  const logged = refusal.logPath === undefined ? "" : `\nsetup output kept at ${refusal.logPath}`;
  return `${header}${tail}${logged}`;
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

function appendTail(tail: Buffer, chunk: Buffer): Buffer {
  const combined = tail.length === 0 ? chunk : Buffer.concat([tail, chunk]);
  return combined.length > SETUP_LOG_TAIL_BYTES
    ? combined.subarray(combined.length - SETUP_LOG_TAIL_BYTES)
    : combined;
}

type YamlMap = Readonly<Record<string, unknown>>;

function isYamlMap(value: unknown): value is YamlMap {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type SetupStore = {
  readonly path: string;
  readonly source: "recorded in the worktree" | "runner's default";
};

async function recordedStoreDir(worktree: string): Promise<string | undefined> {
  try {
    const document: unknown = parseYaml(
      await readFile(join(worktree, "node_modules", ".modules.yaml"), "utf8"),
    );
    if (!isYamlMap(document)) return undefined;
    const storeDir = document["storeDir"];
    return typeof storeDir === "string" && storeDir.trim().length > 0 ? storeDir : undefined;
  } catch {
    return undefined;
  }
}

async function removeTemporary(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch {
    return;
  }
}

async function retainSetupLog(worktree: string, tail: Buffer): Promise<string | undefined> {
  if (tail.length === 0) return undefined;
  try {
    const journalDirectory = await sharedJournalDirectory(worktree);
    const sha256 = createHash("sha256").update(tail).digest("hex");
    const directory = join(journalDirectory, "worktree-setup", "sha256");
    const artifact = join(directory, sha256);
    const temporary = `${artifact}.${randomUUID()}.partial`;
    await mkdir(directory, { recursive: true });
    await writeFile(temporary, tail, { flag: "wx" });
    try {
      await link(temporary, artifact);
    } catch {
      const existing = await readFile(artifact).catch(() => undefined);
      if (existing === undefined || !existing.equals(tail)) {
        await removeTemporary(temporary);
        return undefined;
      }
    }
    await removeTemporary(temporary);
    return artifact;
  } catch {
    return undefined;
  }
}

async function commandFailure(
  worktree: string,
  command: string,
  result: {
    readonly exit: WorktreeSetupExit;
    readonly tail: Buffer;
    readonly timedOut: boolean;
  },
  timeoutMs: number,
): Promise<WorktreeSetupRefusal> {
  const logPath = await retainSetupLog(worktree, result.tail);
  return {
    kind: "command-failed",
    command,
    exit: result.exit,
    tail: result.tail.toString("utf-8"),
    ...(logPath === undefined ? {} : { logPath }),
    ...(result.timedOut ? { timeoutMs } : {}),
  };
}

async function runnerDefaultStore(
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<Result<SetupStore, WorktreeSetupRefusal>> {
  const command = "pnpm store path";
  const result = await runOwnedCommandWithTimeout(
    ["mise", "exec", "--", "pnpm", "store", "path"],
    cwd,
    env,
    timeoutMs,
  );
  const exit: WorktreeSetupExit =
    result.signal !== null
      ? { kind: "signal", signal: result.signal }
      : { kind: "exit", code: result.code };
  const path = result.stdout.toString("utf8").trim();
  if (exit.kind === "exit" && exit.code === 0 && path.length > 0) {
    return ok({ path, source: "runner's default" });
  }
  return err(
    await commandFailure(
      cwd,
      command,
      {
        exit,
        tail: appendTail(Buffer.alloc(0), result.output),
        timedOut: result.timedOut,
      },
      timeoutMs,
    ),
  );
}

async function setupStore(
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<Result<SetupStore, WorktreeSetupRefusal>> {
  const recorded = await recordedStoreDir(cwd);
  if (recorded !== undefined) return ok({ path: recorded, source: "recorded in the worktree" });
  return runnerDefaultStore(cwd, env, timeoutMs);
}

async function spawnSetupCommand(
  tokens: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  heavy: readonly string[],
  timeoutMs: number,
  store: SetupStore,
): Promise<{
  readonly exit: WorktreeSetupExit;
  readonly tail: Buffer;
  readonly timedOut: boolean;
}> {
  const [bin, ...args] = [...heavy, "mise", "exec", "--", ...tokens];
  const result = await runOwnedCommandWithTimeout([bin ?? "mise", ...args], cwd, env, timeoutMs);
  const exit: WorktreeSetupExit =
    result.signal !== null
      ? { kind: "signal", signal: result.signal }
      : { kind: "exit", code: result.code };
  const storeLine = Buffer.from(`worktree setup store: ${store.path} (${store.source})\n`);
  return {
    exit,
    tail: appendTail(result.output, storeLine),
    timedOut: result.timedOut,
  };
}

export async function runSetupCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  heavy: readonly string[] = [],
  runVersion: NodeVersionRunner | undefined = undefined,
  holdTimeoutMs: number = DEFAULT_WORKTREE_SETUP_HOLD_TIMEOUT_MS,
): Promise<Result<void, WorktreeSetupRefusal>> {
  const tokens = tokenize(command);
  if (tokens.length === 0) {
    return err({ kind: "command-failed", command, exit: { kind: "exit", code: -1 }, tail: "" });
  }
  const commandEnv = nonInteractiveEnvironment(env);
  const versionRunner =
    runVersion ??
    (async (argv: readonly string[], versionCwd: string, versionEnv: NodeJS.ProcessEnv) => {
      const result = await runOwnedCommandWithTimeout(argv, versionCwd, versionEnv, holdTimeoutMs);
      return ok({
        code: result.code,
        signal: result.signal,
        stdout: result.stdout.toString("utf8"),
        stderr: result.stderr.toString("utf8"),
      });
    });
  const nodeEngine = await checkNodeEngine(cwd, "worktree setup", commandEnv, heavy, versionRunner);
  if (isErr(nodeEngine)) return nodeEngine;
  const store = await setupStore(cwd, commandEnv, holdTimeoutMs);
  if (isErr(store)) return store;
  const setupEnv = { ...commandEnv, npm_config_store_dir: store.value.path };
  const { exit, tail, timedOut } = await spawnSetupCommand(
    tokens,
    cwd,
    setupEnv,
    heavy,
    holdTimeoutMs,
    store.value,
  );
  if (exit.kind === "exit" && exit.code === 0) return ok(undefined);
  return err(await commandFailure(cwd, command, { exit, tail, timedOut }, holdTimeoutMs));
}

export async function runWorktreeSetup(
  commands: readonly string[],
  worktreePath: string,
  narrate: (line: string) => void,
  env: NodeJS.ProcessEnv = process.env,
  heavy: readonly string[] = [],
  runVersion: NodeVersionRunner | undefined = undefined,
  holdTimeoutMs: number = DEFAULT_WORKTREE_SETUP_HOLD_TIMEOUT_MS,
): Promise<Result<void, WorktreeSetupRefusal>> {
  for (const command of commands) {
    narrate(`worktree setup: ${command}`);
    const setup = await runSetupCommand(
      command,
      worktreePath,
      env,
      heavy,
      runVersion,
      holdTimeoutMs,
    );
    if (isErr(setup)) return setup;
  }
  return ok(undefined);
}
