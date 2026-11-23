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
  isLiveAttempt,
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
  type ChosenBy,
  explainScopeRefusal,
  fileScope,
  type LedgerProjection,
  leaseIsLive,
  readReplay,
  receiptId,
  runtimeAttribution,
  type SessionRuntime,
  type SessionStartedAt,
  type SessionView,
} from "ledger";
import {
  createHerdrRuntime,
  explainRuntimeRefusal,
  observeRuntime,
  type PaneFact,
  type Runtime,
  type RuntimeObservation,
  unobservedAttempt,
} from "runner";
import type { CommandResult } from "./main.ts";
import { gitOrigin, repositoryForOrigin } from "./repositoryOrigin.ts";

export const POSITIONS_SHAPE = "positions@v2";
export const POSITIONS_V0_SHAPE = "positions@v0";
export const UNRECORDED_IN_V0 = "a positions@v0 read does not record this fact";

export type GraphRead =
  | { readonly graph: string; readonly state: "read"; readonly position: Position }
  | { readonly graph: string; readonly state: "unreadable"; readonly because: string };

export interface LiveAttempt {
  readonly graph: string;
  readonly node: string;
  readonly session: string;
  readonly role?: NodeRole;
  readonly runtime: SessionRuntime;
  readonly provider?: string;
  readonly chosenBy?: ChosenBy;
  readonly agentStatus: AgentStatus;
  readonly pane: PaneFact;
  readonly startedAt: SessionStartedAt;
}

export type LiveAttemptV0 = Omit<LiveAttempt, "pane" | "startedAt">;

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

type ReadRepository = Extract<RepositoryPosition, { readonly live: readonly LiveAttempt[] }>;

export type RepositoryPositionV0 =
  | Exclude<RepositoryPosition, ReadRepository>
  | (Omit<ReadRepository, "live"> & { readonly live: readonly LiveAttemptV0[] });

export interface PositionsV0 {
  readonly interlock: typeof POSITIONS_V0_SHAPE;
  readonly repositories: readonly RepositoryPositionV0[];
}

export const READY_SHAPE = "ready@v0";

export interface ReadyNode {
  readonly graph: string;
  readonly node: string;
  readonly criticalPathIndex: number;
  readonly nodeIndex: number;
}

export interface UnreadableGraph {
  readonly graph: string;
  readonly because: string;
}

export type ReadyRepository =
  | {
      readonly root: string;
      readonly origin?: { readonly owner: string; readonly name: string };
      readonly state: "read";
      readonly ready: readonly ReadyNode[];
      readonly unreadable: readonly UnreadableGraph[];
    }
  | {
      readonly root: string;
      readonly state: "not-found";
      readonly because: string;
      readonly ready: readonly [];
    };

export interface Ready {
  readonly interlock: typeof READY_SHAPE;
  readonly repositories: readonly ReadyRepository[];
}

function readyNodesOf(position: Position, graph: string): readonly ReadyNode[] {
  const onCriticalPath = new Map(position.criticalPath.map((id, index) => [id, index]));
  const entries: ReadyNode[] = [];
  position.nodes.forEach((node, nodeIndex) => {
    if (node.state.kind !== "ready") return;
    if (node.attempts.some(isLiveAttempt)) return;
    entries.push({
      graph,
      node: node.id,
      criticalPathIndex: onCriticalPath.get(node.id) ?? -1,
      nodeIndex,
    });
  });
  const launchOrder = (entry: ReadyNode): number =>
    entry.criticalPathIndex === -1 ? Number.MAX_SAFE_INTEGER : entry.criticalPathIndex;
  return entries.sort((a, b) => launchOrder(a) - launchOrder(b) || a.nodeIndex - b.nodeIndex);
}

export function readyOf(positions: Positions): Ready {
  const repositories = positions.repositories.map((repository): ReadyRepository => {
    if (repository.state === "not-found") {
      return {
        root: repository.asked,
        state: "not-found",
        because: repository.because,
        ready: [],
      };
    }
    const ready: ReadyNode[] = [];
    const unreadable: UnreadableGraph[] = [];
    for (const graph of repository.graphs) {
      if (graph.state === "unreadable") {
        unreadable.push({ graph: graph.graph, because: graph.because });
        continue;
      }
      if (graph.position.approval !== "approved") continue;
      ready.push(...readyNodesOf(graph.position, graph.graph));
    }
    return {
      root: repository.root,
      ...(repository.origin?.state === "identified"
        ? { origin: { owner: repository.origin.owner, name: repository.origin.name } }
        : {}),
      state: "read",
      ready,
      unreadable,
    };
  });
  return { interlock: READY_SHAPE, repositories };
}

export function upcastPositionsV0(read: PositionsV0): Positions {
  const unrecorded: { readonly state: "unknown"; readonly because: string } = {
    state: "unknown",
    because: UNRECORDED_IN_V0,
  };
  return {
    interlock: POSITIONS_SHAPE,
    repositories: read.repositories.map((repository) =>
      !("live" in repository)
        ? repository
        : {
            ...repository,
            live: repository.live.map((attempt) => ({
              ...attempt,
              ...runtimeAttribution(attempt.runtime),
              pane: unrecorded,
              startedAt: unrecorded,
            })),
          },
    ),
  };
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

function liveAttemptOf(session: SessionView, observation: RuntimeObservation): LiveAttempt {
  const observed = observation.attempt({
    graph: session.node.graph,
    node: session.node.id,
    session: session.session,
  });
  return {
    graph: session.node.graph,
    node: session.node.id,
    session: session.session,
    ...(isNodeRole(session.brief.role) ? { role: session.brief.role } : {}),
    runtime: session.runtime,
    ...runtimeAttribution(session.runtime),
    agentStatus: observed.agentStatus,
    pane: observed.pane,
    startedAt: session.startedAt,
  };
}

function sharedObservation(injected: Runtime | undefined): () => Promise<RuntimeObservation> {
  let observed: Promise<RuntimeObservation> | undefined;
  const observe = async (): Promise<RuntimeObservation> => {
    if (injected !== undefined) return observeRuntime(injected);
    const created = await createHerdrRuntime();
    if (isErr(created)) {
      const because = `the runtime is unavailable: ${explainRuntimeRefusal(created.error)}`;
      return { attempt: () => unobservedAttempt(because) };
    }
    return observeRuntime(created.value);
  };
  return () => {
    observed ??= observe();
    return observed;
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
  const contentHash = await receiptId(repoRoot, fileScope([relative(repoRoot, path)]), "approved");
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
  live: readonly LiveAttempt[],
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
      (session) => live.find((attempt) => attempt.session === session)?.agentStatus,
      landed,
    ),
  };
}

async function repositoryPosition(
  asked: string,
  observation: () => Promise<RuntimeObservation>,
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
  const observed = live.length === 0 ? undefined : await observation();
  const attempts =
    observed === undefined ? [] : live.map((session) => liveAttemptOf(session, observed));
  const loads: GraphLoad[] = [];
  for (const graphId of graphIds) loads.push(await graphLoad(root, graphId));
  const landed = await mainLineReader(root, { git }).read(
    loads.flatMap((load) =>
      load.state === "loaded" ? clearedHeadsOf(load.document, projection) : [],
    ),
  );
  const graphs = loads.map((load) => graphRead(load, projection, nowWallMs, attempts, landed));
  return {
    ...found,
    journal: { state: "read" },
    graphs,
    live: attempts,
  };
}

export async function positionsOf(
  asked: readonly string[],
  runtime: Runtime | undefined,
  clock: Clock,
): Promise<Positions> {
  const nowWallMs = clock.now().wallMs;
  const git = boundedGit();
  const observation = sharedObservation(runtime);
  const repositories: RepositoryPosition[] = [];
  for (const path of asked) {
    repositories.push(await repositoryPosition(path, observation, nowWallMs, git));
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

function renderReadyRepository(repository: ReadyRepository): string {
  if (repository.state === "not-found") return repository.because;
  const header =
    repository.origin === undefined
      ? repository.root
      : `${repository.root} (${repository.origin.owner}/${repository.origin.name})`;
  return [
    header,
    ...repository.ready.map((entry) => `${entry.graph}/${entry.node}`),
    ...repository.unreadable.map((graph) => `${graph.graph} — unreadable: ${graph.because}`),
  ].join("\n");
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
  if (args.includes("--ready")) {
    const ready = readyOf(positions);
    return {
      exitCode: 0,
      message: args.includes("--json")
        ? JSON.stringify(ready)
        : ready.repositories.map(renderReadyRepository).join("\n\n"),
    };
  }
  return {
    exitCode: 0,
    message: args.includes("--json")
      ? JSON.stringify(positions, null, 2)
      : positions.repositories.map(renderRepository).join("\n\n"),
  };
}
