import { dirname } from "node:path";
import { findRepoRoot, sharedJournalDirectory } from "face";
import { type ExecSessionView, execRunRoot, listExecSessions, readExecTranscript } from "runner";
import type { CommandResult } from "./main.ts";

function jsonFlag(args: readonly string[]): boolean {
  return args.includes("--json");
}

function phaseFlag(args: readonly string[]): string | undefined {
  const index = args.indexOf("--phase");
  return index === -1 ? undefined : args[index + 1];
}

function runRoot(journal: string): string {
  return execRunRoot(dirname(dirname(journal)));
}

function renderSessions(sessions: readonly ExecSessionView[], json: boolean): string {
  return json
    ? JSON.stringify({ interlock: "sessions@v0", sessions })
    : sessions
        .map(
          (session) =>
            `${session.id}/${session.phaseId} ${session.state} ${session.graph}/${session.node ?? "review"}`,
        )
        .join("\n");
}

export async function runSessions(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined)
    return { exitCode: 1, message: `${cwd}: no interlock repository found.` };
  const journal = await sharedJournalDirectory(repoRoot);
  const sessions = await listExecSessions(runRoot(journal), args.includes("--live"));
  return { exitCode: 0, message: renderSessions(sessions, jsonFlag(args)) };
}

async function readSession(args: readonly string[], cwd: string): Promise<CommandResult> {
  const id = args[0];
  if (id === undefined)
    return { exitCode: 1, message: "interlock sessions read: expected a session id." };
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined)
    return { exitCode: 1, message: `${cwd}: no interlock repository found.` };
  const journal = await sharedJournalDirectory(repoRoot);
  const phase = phaseFlag(args);
  const find = async (): Promise<ExecSessionView | undefined> => {
    const sessions = await listExecSessions(runRoot(journal));
    return sessions.find(
      (session) => session.id === id && (phase === undefined || session.phaseId === phase),
    );
  };
  let session = await find();
  if (session === undefined) return { exitCode: 1, message: `${id}: no exec session found.` };
  let lines = await readExecTranscript(dirname(session.transcriptPath));
  if (args.includes("--follow")) {
    while (session.state === "running") {
      await new Promise((resolve) => setTimeout(resolve, 50));
      session = (await find()) ?? session;
      lines = await readExecTranscript(dirname(session.transcriptPath));
    }
  }
  return {
    exitCode: 0,
    message: jsonFlag(args)
      ? lines.map((line) => JSON.stringify(line)).join("\n")
      : lines.map((line) => `[${line.ts}] ${line.stream}: ${line.text}`).join("\n"),
  };
}

export async function runSessionsRead(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  return readSession(args, options.cwd ?? process.cwd());
}

export function isSessionsCommand(args: readonly string[]): boolean {
  return args.length > 0 && args[0] === "sessions";
}
