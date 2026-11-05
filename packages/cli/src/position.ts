import { relative, resolve } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, type Result } from "@phyxiusjs/fp";
import {
  type AgentStatus,
  boundedGit,
  clearedHeadsOf,
  explainGraphRefusal,
  findRepoRoot,
  type GitRunner,
  type GraphDocument,
  graphFilePath,
  isNodeRole,
  type LandedReader,
  listGraphIds,
  loadGraphDocument,
  mainLineReader,
  type NodeRole,
  type Position,
  positionOf,
  renderPosition,
  renderSessionRuntime,
  sharedJournalDirectory,
} from "face";
import {
  explainScopeRefusal,
  type LedgerProjection,
  leaseIsLive,
  readReplay,
  receiptId,
  type SessionRuntime,
  type SessionView,
} from "ledger";
import type { Runtime } from "runner";
import { sharedRuntime, statusesFrom } from "./herdrStatus.ts";
import type { CommandResult } from "./main.ts";
import { gitOrigin, repositoryForOrigin } from "./repositoryOrigin.ts";

export const POSITIONS_SHAPE = "positions@v0";

export type GraphRead =
  | { readonly graph: string; readonly state: "read"; readonly position: Position }
  | { readonly graph: string; readonly state: "unreadable"; readonly because: string };

export interface LiveAttempt {
  readonly graph: string;
  readonly node: string;
  readonly session: string;
  readonly role?: NodeRole;
  readonly runtime: SessionRuntime;
  readonly agentStatus: AgentStatus;
}

export type RepositoryOrigin =
  | {
      readonly state: "identified";
      readonly url: string;
      readonly owner: string;
      readonly name: string;
    }
  | { readonly state: "unidentified"; readonly because: string };

export interface JournalRefusal {
  readonly line?: number;
  readonly because: string;
}

interface RepositoryFound {
  readonly asked: string;
  readonly state: "found";
  readonly root: string;
  readonly origin?: RepositoryOrigin;
  readonly graphs: readonly GraphRead[];
}

export type RepositoryPosition =
  | (RepositoryFound & {
      readonly journal: { readonly state: "read" };
      readonly live: readonly LiveAttempt[];
    })
  | (RepositoryFound & {
      readonly journal: { readonly state: "unreadable" } & JournalRefusal;
    })
  | { readonly asked: string; readonly state: "not-found"; readonly because: string };

export interface Positions {
  readonly interlock: typeof POSITIONS_SHAPE;
  readonly repositories: readonly RepositoryPosition[];
}

async function readJournal(repoRoot: string): Promise<Result<LedgerProjection, JournalRefusal>> {
  try {
    const journal = await sharedJournalDirectory(repoRoot);
    const replayed = await readReplay(journal);
    if (isErr(replayed)) {
      return err({
        line: replayed.error.line,
        because: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
      });
    }
    return replayed;
  } catch (error) {
    return err({ because: error instanceof Error ? error.message : String(error) });
  }
}

async function originOf(repoRoot: string): Promise<RepositoryOrigin | undefined> {
  const origin = await gitOrigin(repoRoot);
  if (isErr(origin)) return undefined;
  const repository = repositoryForOrigin(origin.value);
  if (isErr(repository)) return { state: "unidentified", because: repository.error };
  return {
    state: "identified",
    url: repository.value.originUrl,
    owner: repository.value.owner,
    name: repository.value.name,
  };
}

async function agentStatusesOf(
  live: readonly SessionView[],
  runtime: () => Promise<Runtime | undefined>,
): Promise<ReadonlyMap<string, AgentStatus>> {
  if (live.length === 0) return new Map();
  const observing = await runtime();
  if (observing === undefined) return new Map();
  const graphIds = [...new Set(live.map((session) => session.node.graph))];
  const resolved = await Promise.all(
    graphIds.map((graphId) =>
      statusesFrom(
        graphId,
        live.filter((session) => session.node.graph === graphId),
        observing,
      ),
    ),
  );
  return new Map(resolved.flatMap((statuses) => [...statuses]));
}

function liveAttemptOf(
  session: SessionView,
  statuses: ReadonlyMap<string, AgentStatus>,
): LiveAttempt {
  return {
    graph: session.node.graph,
    node: session.node.id,
    session: session.session,
    ...(isNodeRole(session.brief.role) ? { role: session.brief.role } : {}),
    runtime: session.runtime,
    agentStatus: statuses.get(session.session) ?? "unknown",
  };
}

type GraphLoad =
  | {
      readonly graph: string;
      readonly state: "loaded";
      readonly document: GraphDocument;
      readonly contentHash: string;
    }
  | { readonly graph: string; readonly state: "unreadable"; readonly because: string };

async function graphLoad(repoRoot: string, graphId: string): Promise<GraphLoad> {
  const path = graphFilePath(repoRoot, graphId);
  const document = await loadGraphDocument(path);
  if (isErr(document)) {
    return { graph: graphId, state: "unreadable", because: explainGraphRefusal(document.error) };
  }
  const contentHash = await receiptId(repoRoot, [relative(repoRoot, path)], "approved");
  if (isErr(contentHash)) {
    return { graph: graphId, state: "unreadable", because: explainScopeRefusal(contentHash.error) };
  }
  return {
    graph: graphId,
    state: "loaded",
    document: document.value,
    contentHash: contentHash.value,
  };
}

function graphRead(
  load: GraphLoad,
  projection: LedgerProjection,
  nowWallMs: number,
  statuses: ReadonlyMap<string, AgentStatus>,
  landed: LandedReader,
): GraphRead {
  if (load.state === "unreadable") return load;
  return {
    graph: load.graph,
    state: "read",
    position: positionOf(
      load.document,
      projection,
      load.contentHash,
      nowWallMs,
      (session) => statuses.get(session),
      landed,
    ),
  };
}

async function repositoryPosition(
  asked: string,
  runtime: () => Promise<Runtime | undefined>,
  nowWallMs: number,
  git: GitRunner,
): Promise<RepositoryPosition> {
  const root = findRepoRoot(asked);
  if (root === undefined) {
    return {
      asked,
      state: "not-found",
      because: `${asked}: no .interlock directory found in this directory or any parent.`,
    };
  }

  const origin = await originOf(root);
  const graphIds = await listGraphIds(root);
  const found: Omit<RepositoryFound, "graphs"> = {
    asked,
    state: "found",
    root,
    ...(origin === undefined ? {} : { origin }),
  };

  const journal = await readJournal(root);
  if (isErr(journal)) {
    return {
      ...found,
      journal: { state: "unreadable", ...journal.error },
      graphs: graphIds.map((graph) => ({
        graph,
        state: "unreadable",
        because: journal.error.because,
      })),
    };
  }

  const projection = journal.value;
  const live = [...projection.sessions.values()].filter((session) =>
    leaseIsLive(session, nowWallMs),
  );
  const statuses = await agentStatusesOf(live, runtime);
  const loads: GraphLoad[] = [];
  for (const graphId of graphIds) loads.push(await graphLoad(root, graphId));
  const landed = await mainLineReader(root, { git }).read(
    loads.flatMap((load) =>
      load.state === "loaded" ? clearedHeadsOf(load.document, projection) : [],
    ),
  );
  const graphs = loads.map((load) => graphRead(load, projection, nowWallMs, statuses, landed));
  return {
    ...found,
    journal: { state: "read" },
    graphs,
    live: live.map((session) => liveAttemptOf(session, statuses)),
  };
}

export async function positionsOf(
  asked: readonly string[],
  runtime: Runtime | undefined,
  clock: Clock,
): Promise<Positions> {
  const nowWallMs = clock.now().wallMs;
  const git = boundedGit();
  const observing = sharedRuntime(runtime);
  const repositories: RepositoryPosition[] = [];
  for (const path of asked) {
    repositories.push(await repositoryPosition(path, observing, nowWallMs, git));
  }
  return { interlock: POSITIONS_SHAPE, repositories };
}

function reposAsked(args: readonly string[], cwd: string): readonly string[] {
  const asked = args.flatMap((arg, index) => {
    const value = args[index + 1];
    return arg === "--repo" && value !== undefined ? [resolve(cwd, value)] : [];
  });
  return asked.length === 0 ? [cwd] : asked;
}

function renderGraph(read: GraphRead): string {
  return read.state === "read"
    ? renderPosition(read.position)
    : `${read.graph} — unreadable: ${read.because}`;
}

function renderLive(attempt: LiveAttempt): string {
  return `${attempt.graph}/${attempt.node} — ${attempt.role ?? "no role"}, ${renderSessionRuntime(attempt.runtime)}, ${attempt.agentStatus}`;
}

function renderRepository(repository: RepositoryPosition): string {
  if (repository.state === "not-found") return repository.because;
  const header =
    repository.origin?.state === "identified"
      ? `${repository.root} (${repository.origin.url})`
      : repository.root;
  const journal =
    "live" in repository
      ? repository.live.map(renderLive)
      : [`journal unreadable: ${repository.journal.because}`];
  return [header, ...journal, ...repository.graphs.map(renderGraph)].join("\n\n");
}

export async function runInterlockPosition(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly runtime?: Runtime;
    readonly clock?: Clock;
  } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const positions = await positionsOf(
    reposAsked(args, cwd),
    options.runtime,
    options.clock ?? createSystemClock(),
  );
  return {
    exitCode: 0,
    message: args.includes("--json")
      ? JSON.stringify(positions, null, 2)
      : positions.repositories.map(renderRepository).join("\n\n"),
  };
}
