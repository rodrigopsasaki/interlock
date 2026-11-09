import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import {
  checkNodeEngine,
  explainNodeEngineRefusal,
  type NodeEngineRefusal,
  type NodeVersionRunner,
} from "./nodeEngine.ts";
import { spawnOwned } from "./ownedCommand.ts";

export const SETUP_LOG_TAIL_BYTES = 64 * 1024;

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
    }
  | NodeEngineRefusal;

function describeExit(exit: WorktreeSetupExit): string {
  return exit.kind === "exit" ? `exited ${exit.code}` : `was killed by ${exit.signal}`;
}

export function explainWorktreeSetupRefusal(refusal: WorktreeSetupRefusal): string {
  if (refusal.kind === "node-engine") return explainNodeEngineRefusal(refusal);
  const header = `"${refusal.command}" ${describeExit(refusal.exit)}.`;
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

function spawnSetupCommand(
  tokens: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  heavy: readonly string[],
): Promise<{ readonly exit: WorktreeSetupExit; readonly tail: Buffer }> {
  return new Promise((resolve) => {
    const [bin, ...args] = [...heavy, "mise", "exec", "--", ...tokens];
    const child = spawnOwned([bin ?? "mise", ...args], cwd, env, false);
    child.on("error", (error) => {
      tail = appendTail(tail, Buffer.from(error.message));
    });
    let tail: Buffer = Buffer.alloc(0);
    const onData = (chunk: Buffer) => {
      tail = appendTail(tail, chunk);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code, signal) => {
      const exit: WorktreeSetupExit =
        signal !== null ? { kind: "signal", signal } : { kind: "exit", code: code ?? -1 };
      resolve({ exit, tail });
    });
  });
}

export async function runSetupCommand(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  heavy: readonly string[] = [],
  runVersion: NodeVersionRunner | undefined = undefined,
): Promise<Result<void, WorktreeSetupRefusal>> {
  const tokens = tokenize(command);
  if (tokens.length === 0) {
    return err({ kind: "command-failed", command, exit: { kind: "exit", code: -1 }, tail: "" });
  }
  const nodeEngine = await checkNodeEngine(cwd, "worktree setup", env, heavy, runVersion);
  if (isErr(nodeEngine)) return nodeEngine;
  const { exit, tail } = await spawnSetupCommand(tokens, cwd, env, heavy);
  if (exit.kind === "exit" && exit.code === 0) return ok(undefined);
  const logPath = await retainSetupLog(cwd, tail);
  return err({
    kind: "command-failed",
    command,
    exit,
    tail: tail.toString("utf-8"),
    ...(logPath === undefined ? {} : { logPath }),
  });
}

export async function runWorktreeSetup(
  commands: readonly string[],
  worktreePath: string,
  narrate: (line: string) => void,
  env: NodeJS.ProcessEnv = process.env,
  heavy: readonly string[] = [],
  runVersion: NodeVersionRunner | undefined = undefined,
): Promise<Result<void, WorktreeSetupRefusal>> {
  for (const command of commands) {
    narrate(`worktree setup: ${command}`);
    const setup = await runSetupCommand(command, worktreePath, env, heavy, runVersion);
    if (isErr(setup)) return setup;
  }
  return ok(undefined);
}
