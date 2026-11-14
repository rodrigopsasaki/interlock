import {
  type ChildProcessWithoutNullStreams,
  type SpawnSyncOptions,
  spawn,
  spawnSync,
} from "node:child_process";
import { err, ok, type Result } from "@phyxiusjs/fp";

export type OwnedProcess = ChildProcessWithoutNullStreams;

export const DEFAULT_COMMAND_TERM_GRACE_MS = 250;

export interface TimedOwnedCommandResult {
  readonly code: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly output: string;
  readonly timedOut: boolean;
}

export function nonInteractiveEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, CI: "1", npm_config_confirm_modules_purge: "false" };
}

export function execFileSyncOwned(
  program: string,
  args: readonly string[],
  options: Pick<SpawnSyncOptions, "cwd" | "env" | "maxBuffer" | "stdio"> & {
    readonly encoding?: "utf8" | "utf-8";
  } = {},
): string {
  const result = spawnSync(program, [...args], {
    ...options,
    encoding: "utf8",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    throw new Error(
      stderr.length === 0 ? `${program} exited ${result.status ?? "unknown"}` : stderr,
    );
  }
  return typeof result.stdout === "string" ? result.stdout : "";
}

export function spawnOwned(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  detached: boolean,
): OwnedProcess {
  const [program, ...args] = argv;
  if (program === undefined) throw new Error("owned command received an empty argv");
  return spawn(program, args, { cwd, env, detached, stdio: "pipe" });
}

function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signalGroup(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {}
}

async function waitForGroupGone(pid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (groupAlive(pid) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

async function terminateGroup(pid: number, graceMs: number): Promise<void> {
  signalGroup(pid, "SIGTERM");
  await waitForGroupGone(pid, graceMs);
  if (groupAlive(pid)) signalGroup(pid, "SIGKILL");
}

export function runOwnedCommandWithTimeout(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
  termGraceMs: number = DEFAULT_COMMAND_TERM_GRACE_MS,
): Promise<TimedOwnedCommandResult> {
  return new Promise((resolve) => {
    let child: OwnedProcess;
    try {
      child = spawnOwned(argv, cwd, nonInteractiveEnvironment(env), true);
    } catch (error) {
      resolve({
        code: -1,
        signal: null,
        stdout: "",
        stderr: error instanceof Error ? error.message : String(error),
        output: error instanceof Error ? error.message : String(error),
        timedOut: false,
      });
      return;
    }

    let stdout = "";
    let stderr = "";
    let output = "";
    let timedOut = false;
    let termination: Promise<void> | undefined;
    let timer: NodeJS.Timeout | undefined;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      output += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      output += chunk;
    });
    child.on("error", (error) => {
      stderr += error.message;
      output += error.message;
    });
    child.on("close", async (code, signal) => {
      if (timer !== undefined) clearTimeout(timer);
      if (termination !== undefined) await termination;
      resolve({ code: code ?? -1, signal, stdout, stderr, output, timedOut });
    });
    child.stdin.end();
    timer = setTimeout(() => {
      timedOut = true;
      termination =
        child.pid === undefined ? Promise.resolve() : terminateGroup(child.pid, termGraceMs);
    }, timeoutMs);
  });
}

export interface OwnedCommandResult {
  readonly code: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

export function runOwnedCommand(
  argv: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<Result<OwnedCommandResult, string>> {
  return new Promise((resolve) => {
    let child: OwnedProcess;
    try {
      child = spawnOwned(argv, cwd, nonInteractiveEnvironment(env), true);
    } catch (error) {
      resolve(err(error instanceof Error ? error.message : String(error)));
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => resolve(err(error.message)));
    child.on("close", (code, signal) => resolve(ok({ code: code ?? -1, signal, stdout, stderr })));
    child.stdin.end();
  });
}
