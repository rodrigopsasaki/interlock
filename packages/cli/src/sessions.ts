import { dirname } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { findRepoRoot, sharedJournalDirectory } from "face";
import { createLedger, type Ledger, leaseIsLive } from "ledger";
import {
  createHerdrRuntime,
  type ExecSessionRecord,
  type ExecSessionView,
  execRunRoot,
  listExecSessionRecords,
  listExecSessions,
  type Runtime,
  readExecTranscript,
  stopExecSession,
  stopMachinePane,
} from "runner";
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
  const invalid = args.find((arg) => arg !== "--live" && arg !== "--all" && arg !== "--json");
  if (invalid !== undefined)
    return { exitCode: 1, message: `interlock sessions: unknown argument "${invalid}".` };
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined)
    return { exitCode: 1, message: `${cwd}: no interlock repository found.` };
  const journal = await sharedJournalDirectory(repoRoot);
  const sessions = await listExecSessions(runRoot(journal), args.includes("--live"));
  return { exitCode: 0, message: renderSessions(sessions, jsonFlag(args)) };
}

function stopFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  const value = index === -1 ? undefined : args[index + 1];
  return value === undefined || value.startsWith("--") || value.length === 0 ? undefined : value;
}

function stopArgument(args: readonly string[]): string | undefined {
  for (let index = 1; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--attempt") continue;
    if (arg === "--by" || arg === "--because") {
      index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
}

function execTarget(record: ExecSessionRecord) {
  return {
    graph: record.graph,
    node: record.node,
    session: record.id,
    phaseId: record.phaseId,
    controlSocketPath: record.controlSocketPath,
    controlSecret: record.controlSecret,
  };
}

async function openLedger(
  cwd: string,
  clock: Clock,
): Promise<
  | { readonly kind: "ok"; readonly ledger: Ledger; readonly journal: string }
  | { readonly kind: "error"; readonly result: CommandResult }
> {
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined)
    return {
      kind: "error",
      result: { exitCode: 1, message: `${cwd}: no interlock repository found.` },
    };
  const journal = await sharedJournalDirectory(repoRoot);
  const opened = await createLedger({ clock, directory: journal });
  return isErr(opened)
    ? {
        kind: "error",
        result: { exitCode: 1, message: `${journal}: could not read the interlock ledger.` },
      }
    : { kind: "ok", ledger: opened.value, journal };
}

export async function runSessionsStop(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock; readonly runtime?: Runtime } = {},
): Promise<CommandResult> {
  const id = args[0];
  if (id === undefined)
    return { exitCode: 1, message: "interlock sessions stop: expected a session id." };
  const invalid = stopArgument(args);
  if (invalid !== undefined)
    return { exitCode: 1, message: `interlock sessions stop: unknown argument "${invalid}".` };
  const by = stopFlag(args, "--by");
  const because = stopFlag(args, "--because");
  if (by === undefined)
    return { exitCode: 1, message: "interlock sessions stop: refuses without --by." };
  if (because === undefined)
    return { exitCode: 1, message: "interlock sessions stop: refuses without --because." };

  const cwd = options.cwd ?? process.cwd();
  const clock = options.clock ?? createSystemClock();
  const opened = await openLedger(cwd, clock);
  if (opened.kind === "error") return opened.result;
  const { ledger, journal } = opened;
  try {
    const repoRoot = findRepoRoot(cwd);
    if (repoRoot === undefined)
      return { exitCode: 1, message: `${cwd}: no interlock repository found.` };
    const records = await listExecSessionRecords(execRunRoot(dirname(dirname(journal))));
    const execIds = new Set(records.map((record) => record.id));
    const paneIds = new Set(
      [...ledger.projection().sessions.values()].map((session) => session.session),
    );
    const ids = [...new Set([...execIds, ...paneIds])];
    const matches = ids.filter((candidate) => candidate.startsWith(id));
    if (matches.length === 0)
      return { exitCode: 1, message: `${id}: unknown session; nothing was stopped or recorded.` };
    if (matches.length > 1)
      return {
        exitCode: 1,
        message: `${id}: ambiguous session prefix; matches ${matches.join(", ")}; nothing was stopped or recorded.`,
      };
    const selected = matches[0];
    if (selected === undefined) return { exitCode: 1, message: `${id}: unknown session.` };
    const execRecords = records.filter((record) => record.id === selected);
    if (execRecords.length > 0) {
      const running = execRecords.find((record) => record.state === "running");
      if (running === undefined)
        return {
          exitCode: 1,
          message: `${selected}: session has ended; nothing was stopped or recorded.`,
        };
      const stopped = await stopExecSession(
        ledger,
        execTarget(running),
        by,
        because,
        args.includes("--attempt") ? "attempt" : "phase",
      );
      return isErr(stopped)
        ? { exitCode: 1, message: `${selected}: stop delivery is uncertain (${stopped.error}).` }
        : { exitCode: 0, message: `${selected}: stop recorded and dispatched by ${by}.` };
    }
    const now = clock.now().wallMs;
    const attempt = [...ledger.projection().sessions.values()].find(
      (session) => session.session === selected && leaseIsLive(session, now),
    );
    if (attempt === undefined)
      return {
        exitCode: 1,
        message: `${selected}: session has ended; nothing was stopped or recorded.`,
      };
    const runtimeResult =
      options.runtime === undefined ? await createHerdrRuntime() : ok(options.runtime);
    if (isErr(runtimeResult))
      return {
        exitCode: 1,
        message: `${selected}: ${runtimeResult.error.kind} while finding its pane; nothing was stopped or recorded.`,
      };
    if (runtimeResult.value.resolveAgent === undefined)
      return {
        exitCode: 1,
        message: `${selected}: runtime cannot find its pane; nothing was stopped or recorded.`,
      };
    const agent = await runtimeResult.value.resolveAgent({
      graph: attempt.node.graph,
      node: attempt.node.id,
      session: selected,
    });
    if (isErr(agent) || agent.value === undefined)
      return {
        exitCode: 1,
        message: `${selected}: pane was not found; nothing was stopped or recorded.`,
      };
    const stopped = await stopMachinePane(ledger, runtimeResult.value, attempt.node, selected, {
      token: `${selected}/stop/${agent.value.pane.id}`,
      pane: agent.value.pane.id,
      cwd: repoRoot,
      release: [],
      env: {},
      stop: { by, because },
    });
    return isErr(stopped)
      ? { exitCode: 1, message: `${selected}: stop delivery is uncertain (${stopped.error}).` }
      : { exitCode: 0, message: `${selected}: pane stop recorded and dispatched by ${by}.` };
  } finally {
    await ledger.close();
  }
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
