import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { findRepoRoot, sharedJournalDirectory } from "face";
import { createLedger, type Ledger, leaseIsLive } from "ledger";
import {
  createHerdrRuntime,
  type EnumeratedAgent,
  type ExecSessionRecord,
  type ExecSessionView,
  execFileSyncOwned,
  execRunRoot,
  explainRuntimeRefusal,
  listExecSessionRecords,
  listExecSessions,
  type Runtime,
  readExecTranscript,
  readRepositoryIndex,
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

function withoutShape(session: ExecSessionView) {
  const { interlock: _interlock, ...legacy } = session;
  return legacy;
}

function renderSessions(sessions: readonly ExecSessionView[], json: boolean): string {
  return json
    ? JSON.stringify({ interlock: "sessions@v0", sessions: sessions.map(withoutShape) })
    : sessions
        .map(
          (session) =>
            `${session.id}/${session.phaseId} ${session.state} ${session.graph}/${session.node ?? "review"}`,
        )
        .join("\n");
}

type LiveLiveness = "live" | "unknown";
type SourceState = "read" | "partial" | "unreadable";

export interface LiveSessionRow {
  readonly id: string;
  readonly repository: string | null;
  readonly graph: string | null;
  readonly node: string | null;
  readonly kind: "node" | "review" | null;
  readonly transport: "pane" | "exec";
  readonly runtime: string;
  readonly pid: number | null;
  readonly phase: "work" | "debrief" | "review" | null;
  readonly phaseId: string | null;
  readonly liveness: LiveLiveness;
}

interface SourceRead {
  readonly state: SourceState;
  readonly because?: string;
}

interface LiveSessionsDocument {
  readonly interlock: "sessions@v1";
  readonly state: "complete" | "partial";
  readonly count: number;
  readonly sessions: readonly LiveSessionRow[];
  readonly sources: {
    readonly repositories: SourceRead;
    readonly herdr: SourceRead;
  };
}

type ExecLiveness = "live" | "dead" | "unknown";

function errorCode(error: unknown): string | undefined {
  if (!(error instanceof Error) || !("code" in error)) return undefined;
  const code = error.code;
  return typeof code === "string" ? code : undefined;
}

function processStartMs(pid: number): number | undefined {
  try {
    process.kill(pid, 0);
  } catch (error) {
    return errorCode(error) === "ESRCH" ? -1 : undefined;
  }
  try {
    const output = execFileSyncOwned("ps", ["-p", String(pid), "-o", "lstart=", "-o", "stat="], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const fields = output.trim().split(/\s+/);
    const state = fields.at(-1);
    if (state === undefined || state.startsWith("Z")) return -1;
    const value = Date.parse(fields.slice(0, -1).join(" "));
    return Number.isFinite(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function execLiveness(record: ExecSessionRecord): ExecLiveness {
  if (record.pid === null) return "unknown";
  const start = Date.parse(record.startedAt);
  if (!Number.isFinite(start)) return "unknown";
  const observed = processStartMs(record.pid);
  if (observed === -1) return "dead";
  if (observed === undefined) return "unknown";
  return observed <= start + 5_000 ? "live" : "dead";
}

function execRow(
  repository: string,
  record: ExecSessionRecord,
  liveness: LiveLiveness,
): LiveSessionRow {
  return {
    id: record.id,
    repository,
    graph: record.graph,
    node: record.node,
    kind: record.kind,
    transport: "exec",
    runtime: record.runtime,
    pid: record.pid,
    phase: record.phase,
    phaseId: record.phaseId,
    liveness,
  };
}

function paneRepository(
  value: string | undefined,
  entries: readonly { readonly commonGitDir: string; readonly repository: string }[],
): string | undefined {
  if (value === undefined) return undefined;
  const direct = entries.find(
    (entry) => value === entry.repository || value.startsWith(`${entry.repository}/`),
  );
  if (direct !== undefined) return direct.repository;
  try {
    const common = execFileSyncOwned(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: value, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    const matching = entries.find((entry) => entry.commonGitDir === common);
    return matching?.repository ?? value;
  } catch {
    return value;
  }
}

function paneRow(
  agent: EnumeratedAgent,
  entries: readonly { readonly commonGitDir: string; readonly repository: string }[],
): LiveSessionRow {
  return {
    id: agent.sessionId ?? agent.id,
    repository: paneRepository(agent.repository, entries) ?? null,
    graph: agent.graph ?? null,
    node: agent.node ?? null,
    kind: agent.kind ?? null,
    transport: "pane",
    runtime: agent.runtime,
    pid: agent.pid ?? null,
    phase: null,
    phaseId: null,
    liveness: "live",
  };
}

function sameLiveSession(left: LiveSessionRow, right: LiveSessionRow): boolean {
  if (left.transport === right.transport) return false;
  const sameRepositoryId =
    left.repository !== null &&
    right.repository !== null &&
    left.repository === right.repository &&
    left.id === right.id;
  const samePid =
    left.pid !== null && right.pid !== null && left.pid === right.pid && left.liveness === "live";
  return sameRepositoryId || samePid;
}

function mergeRows(left: LiveSessionRow, right: LiveSessionRow): LiveSessionRow {
  if (left.transport === "exec") return left;
  return right;
}

function collapseExecRecords(
  repository: string,
  records: readonly ExecSessionRecord[],
): readonly LiveSessionRow[] {
  const rows = new Map<string, { record: ExecSessionRecord; liveness: LiveLiveness }>();
  for (const record of records) {
    const liveness = execLiveness(record);
    if (liveness === "dead") continue;
    const current = rows.get(record.id);
    if (current === undefined || record.startedAt > current.record.startedAt) {
      rows.set(record.id, { record, liveness });
    }
  }
  return [...rows.values()].map(({ record, liveness }) => execRow(repository, record, liveness));
}

async function allLiveSessions(
  repoRoot: string,
  journal: string,
  options: { readonly runtime?: Runtime } = {},
): Promise<{ readonly document: LiveSessionsDocument; readonly messages: readonly string[] }> {
  const messages: string[] = [];
  const index = readRepositoryIndex();
  messages.push(...index.errors);
  const repositories = new Map<
    string,
    { readonly repository: string; readonly runRoot: string; readonly indexed: boolean }
  >();
  for (const entry of index.entries) {
    repositories.set(entry.commonGitDir, {
      repository: entry.repository,
      runRoot: entry.runRoot,
      indexed: true,
    });
  }
  const callerRunRoot = runRoot(journal);
  repositories.set(`caller:${repoRoot}`, {
    repository: repoRoot,
    runRoot: callerRunRoot,
    indexed: false,
  });

  const rows: LiveSessionRow[] = [];
  let repositoryState: SourceState = index.errors.length === 0 ? "read" : "partial";
  for (const entry of repositories.values()) {
    if (!existsSync(entry.runRoot)) {
      if (entry.indexed)
        messages.push(`repository ${entry.repository}: run root ${entry.runRoot} is unreadable`);
      repositoryState = "partial";
      continue;
    }
    try {
      const records = await listExecSessionRecords(entry.runRoot, true);
      const collapsed = collapseExecRecords(entry.repository, records);
      rows.push(...collapsed);
    } catch {
      messages.push(`repository ${entry.repository}: run root ${entry.runRoot} is unreadable`);
      repositoryState = "partial";
    }
  }
  const created = options.runtime === undefined ? await createHerdrRuntime() : ok(options.runtime);
  let herdrState: SourceState = "read";
  if (isErr(created)) {
    herdrState = "unreadable";
    messages.push(`herdr: ${explainRuntimeRefusal(created.error)}`);
  } else if (created.value.listAgents === undefined) {
    herdrState = "unreadable";
    messages.push("herdr: runtime does not provide agent enumeration");
  } else {
    const listed = await created.value.listAgents();
    if (isErr(listed)) {
      herdrState = "unreadable";
      messages.push(`herdr: ${explainRuntimeRefusal(listed.error)}`);
    } else {
      for (const agent of listed.value) rows.push(paneRow(agent, index.entries));
    }
  }

  const merged: LiveSessionRow[] = [];
  for (const row of rows) {
    const matchIndex = merged.findIndex((candidate) => sameLiveSession(candidate, row));
    if (matchIndex === -1) merged.push(row);
    else {
      const existing = merged[matchIndex];
      if (existing !== undefined) merged[matchIndex] = mergeRows(existing, row);
    }
  }
  merged.sort((left, right) => left.id.localeCompare(right.id));
  const state: "complete" | "partial" =
    repositoryState === "read" && herdrState === "read" ? "complete" : "partial";
  return {
    messages,
    document: {
      interlock: "sessions@v1",
      state,
      count: merged.length,
      sessions: merged,
      sources: {
        repositories: {
          state: repositoryState,
          ...(repositoryState === "read"
            ? {}
            : { because: "one or more repository sources could not be read" }),
        },
        herdr: {
          state: herdrState,
          ...(herdrState === "read" ? {} : { because: "herdr could not enumerate its agents" }),
        },
      },
    },
  };
}

function renderAllSessions(
  result: { readonly document: LiveSessionsDocument; readonly messages: readonly string[] },
  json: boolean,
): string {
  if (json) return JSON.stringify(result.document);
  const rows = result.document.sessions.map(
    (session) =>
      `${session.transport} ${session.id} ${session.liveness} ${session.repository ?? "null"} ${session.graph ?? "null"}/${session.node ?? "null"} ${session.runtime} pid=${session.pid === null ? "null" : String(session.pid)}`,
  );
  return [...result.messages, ...rows, `live sessions: ${String(result.document.count)}`].join(
    "\n",
  );
}

export async function runSessions(
  args: readonly string[],
  options: { readonly cwd?: string; readonly runtime?: Runtime } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const invalid = args.find((arg) => arg !== "--live" && arg !== "--all" && arg !== "--json");
  if (invalid !== undefined)
    return { exitCode: 1, message: `interlock sessions: unknown argument "${invalid}".` };
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined)
    return { exitCode: 1, message: `${cwd}: no interlock repository found.` };
  const journal = await sharedJournalDirectory(repoRoot);
  if (args.includes("--all")) {
    const all = await allLiveSessions(repoRoot, journal, options);
    return { exitCode: 0, message: renderAllSessions(all, jsonFlag(args)) };
  }
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
