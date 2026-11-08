import {
  type ChildProcessWithoutNullStreams,
  type SpawnSyncOptions,
  spawn,
  spawnSync,
} from "node:child_process";
import { err, ok, type Result } from "@phyxiusjs/fp";

export type OwnedProcess = ChildProcessWithoutNullStreams;

export function execFileSyncOwned(
  program: string,
  args: readonly string[],
  options: Pick<SpawnSyncOptions, "cwd" | "maxBuffer" | "stdio"> & {
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
      child = spawnOwned(argv, cwd, env, false);
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
  });
}
