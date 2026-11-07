import { execFileSync } from "node:child_process";
import { isErr } from "@phyxiusjs/fp";
import { readBriefDocument } from "debrief";
import type { LedgerEvent } from "ledger";

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;

type SessionStartedEvent = Extract<LedgerEvent, { readonly kind: "session-started" }>;

interface SessionRecord {
  readonly event: SessionStartedEvent;
  readonly journalIndex: number;
  readonly transition: string;
  readonly ownStart: string;
  readonly effectiveStart: string;
}

export type SessionInheritance =
  | {
      readonly kind: "inherited";
      readonly inheritedStartSha: string;
      readonly predecessorSession: string;
    }
  | { readonly kind: "none"; readonly because: string };

function gitText(repoRoot: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
    }).trim();
  } catch {
    return undefined;
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function briefPath(event: SessionStartedEvent): string {
  return `.interlock/sessions/${event.session.node.graph}/${event.session.node.id}/brief.md`;
}

function briefMatches(
  repoRoot: string,
  sha: string,
  event: SessionStartedEvent,
): boolean {
  if (event.graphBaseSha === undefined) return false;
  const raw = gitText(repoRoot, ["show", `${sha}:${briefPath(event)}`]);
  if (raw === undefined) return false;
  const read = readBriefDocument(raw, `${sha}:${briefPath(event)}`);
  if (isErr(read) || read.value.kind !== "v1") return false;
  const frontMatter = read.value.frontMatter;
  const runner = frontMatter.runner;
  if (runner.kind !== "worktree") return false;
  return (
    frontMatter.graph === event.brief.graph &&
    frontMatter.node === event.brief.node &&
    frontMatter.role === event.brief.role &&
    sameStrings(
      frontMatter.gates.map((gate) => gate.id),
      event.brief.gates,
    ) &&
    sameStrings(frontMatter.scope, event.brief.scope) &&
    runner.graphBaseSha === event.graphBaseSha &&
    runner.session === event.session.id
  );
}

function history(repoRoot: string, graphBaseSha: string, head: string): readonly string[] {
  const raw = gitText(repoRoot, [
    "rev-list",
    "--reverse",
    "--ancestry-path",
    `${graphBaseSha}..${head}`,
  ]);
  return raw === undefined ? [] : raw.split("\n").filter((value) => value.length > 0);
}

function transitionFor(
  repoRoot: string,
  graphBaseSha: string,
  head: string,
  event: SessionStartedEvent,
): string | undefined {
  const commits = history(repoRoot, graphBaseSha, head);
  const matches = commits.filter((commit) => briefMatches(repoRoot, commit, event));
  const starts = matches.filter((commit) => {
    const parents = gitText(repoRoot, ["show", "-s", "--format=%P", commit]);
    if (parents === undefined || parents.length === 0) return false;
    return parents.split(" ").every((parent) => !briefMatches(repoRoot, parent, event));
  });
  return starts.length === 1 ? starts[0] : undefined;
}

function commitPaths(repoRoot: string, commit: string): readonly string[] {
  const raw = gitText(repoRoot, ["diff-tree", "--no-commit-id", "--name-only", "-r", commit]);
  return raw === undefined || raw.length === 0 ? [] : raw.split("\n");
}

function commitParents(repoRoot: string, commit: string): readonly string[] | undefined {
  const raw = gitText(repoRoot, ["rev-list", "--parents", "-n", "1", commit]);
  if (raw === undefined || raw.length === 0) return undefined;
  const [, ...parents] = raw.split(" ");
  return parents;
}

function attemptSessions(repoRoot: string, commit: string): readonly string[] {
  const message = gitText(repoRoot, ["show", "-s", "--format=%B", commit]);
  if (message === undefined) return [];
  return message
    .split("\n")
    .flatMap((line) => {
      const match = /^Attempt: (.+)$/.exec(line);
      return match === null || match[1] === undefined ? [] : [match[1]];
    });
}

function recordFor(
  repoRoot: string,
  graph: string,
  node: string,
  graphBaseSha: string,
  head: string,
  event: SessionStartedEvent,
  journalIndex: number,
): SessionRecord | undefined {
  if (
    event.session.node.graph !== graph ||
    event.session.node.id !== node ||
    event.graphBaseSha !== graphBaseSha
  )
    return undefined;
  const ownStart = transitionFor(repoRoot, graphBaseSha, head, event);
  if (ownStart === undefined) return undefined;
  const effectiveStart = event.inheritedStartSha ?? ownStart;
  if (event.inheritedStartSha !== undefined && event.predecessorSession === undefined)
    return undefined;
  return { event, journalIndex, transition: ownStart, ownStart, effectiveStart };
}

function isSameNodeEvent(
  event: LedgerEvent,
  graph: string,
  node: string,
): event is SessionStartedEvent {
  return (
    event.kind === "session-started" &&
    event.session.node.graph === graph &&
    event.session.node.id === node
  );
}

function recordForSession(
  records: readonly SessionRecord[],
  session: string,
): SessionRecord | undefined {
  return records.find((record) => record.event.session.id === session);
}

function chainOf(
  records: readonly SessionRecord[],
  candidate: SessionRecord,
): readonly SessionRecord[] | undefined {
  const chain: SessionRecord[] = [];
  const seen = new Set<string>();
  let current: SessionRecord | undefined = candidate;
  while (current !== undefined) {
    if (seen.has(current.event.session.id)) return undefined;
    seen.add(current.event.session.id);
    chain.push(current);
    const predecessor = current.event.predecessorSession;
    if (predecessor === undefined) break;
    current = recordForSession(records, predecessor);
  }
  const last = chain[chain.length - 1];
  return last?.event.predecessorSession === undefined ? chain : undefined;
}

function currentIndex(
  events: readonly LedgerEvent[],
  currentSession: string,
): number | undefined {
  const indexes = events.flatMap((event, index) =>
    event.kind === "session-started" && event.session.id === currentSession ? [index] : [],
  );
  return indexes.length === 1 ? indexes[0] : undefined;
}

function debriefPath(graph: string, node: string): string {
  return `.interlock/sessions/${graph}/${node}/debrief.yaml`;
}

function rangeCommits(
  repoRoot: string,
  start: string,
  head: string,
): readonly string[] {
  const raw = gitText(repoRoot, ["rev-list", "--reverse", "--ancestry-path", `${start}..${head}`]);
  return raw === undefined ? [] : raw.split("\n").filter((value) => value.length > 0);
}

export function findInheritedSessionStart(
  repoRoot: string,
  events: readonly LedgerEvent[],
  graph: string,
  node: string,
  graphBaseSha: string,
  head: string,
  currentSession: string,
  currentEvent?: SessionStartedEvent,
): SessionInheritance {
  if (gitText(repoRoot, ["branch", "--show-current"]) !== `graph/${graph}/${node}`)
    return { kind: "none", because: "worktree is not checked out on the node branch" };
  if (gitText(repoRoot, ["cat-file", "-t", head]) !== "commit")
    return { kind: "none", because: "worktree head is not a commit" };

  const commits = history(repoRoot, graphBaseSha, head);
  if (commits.length === 0 && graphBaseSha !== head)
    return { kind: "none", because: "could not read the graph-base ancestry" };

  const currentJournalIndex = currentIndex(events, currentSession);
  if (currentEvent !== undefined) {
    if (currentJournalIndex === undefined)
      return { kind: "none", because: "current session-started event is not unique" };
    if (currentEvent.inheritedStartSha === undefined || currentEvent.predecessorSession === undefined)
      return { kind: "none", because: "current session carries no inherited range" };
  }

  const candidateRecords = events.flatMap((event, journalIndex) => {
    if (!isSameNodeEvent(event, graph, node)) return [];
    if (event.session.id === currentSession) return [];
    if (currentJournalIndex !== undefined && journalIndex >= currentJournalIndex) return [];
    const record = recordFor(repoRoot, graph, node, graphBaseSha, head, event, journalIndex);
    return record === undefined ? [] : [record];
  });
  const onAncestry = candidateRecords.filter(
    (record) =>
      gitText(repoRoot, ["merge-base", "--is-ancestor", graphBaseSha, record.ownStart]) !== undefined &&
      gitText(repoRoot, ["merge-base", "--is-ancestor", record.ownStart, head]) !== undefined,
  );
  if (onAncestry.length === 0)
    return { kind: "none", because: "no predecessor session is on the graph-base ancestry" };

  const positions = onAncestry.map((record) => ({
    record,
    position: commits.indexOf(record.ownStart),
  }));
  const latestPosition = Math.max(...positions.map((entry) => entry.position));
  const latest = positions.filter((entry) => entry.position === latestPosition);
  if (latest.length !== 1)
    return { kind: "none", because: "predecessor session is ambiguous: multiple candidates" };
  const candidate = latest[0]?.record;
  if (candidate === undefined)
    return { kind: "none", because: "predecessor session is ambiguous: no candidate" };
  if (
    gitText(repoRoot, ["cat-file", "-t", candidate.effectiveStart]) !== "commit" ||
    gitText(repoRoot, ["merge-base", "--is-ancestor", candidate.effectiveStart, head]) === undefined
  )
    return { kind: "none", because: "predecessor effective start is not in the worktree history" };

  const records = [...candidateRecords];
  if (currentEvent !== undefined) {
    const currentRecord = recordFor(
      repoRoot,
      graph,
      node,
      graphBaseSha,
      head,
      currentEvent,
      currentJournalIndex ?? 0,
    );
    if (currentRecord !== undefined) records.push(currentRecord);
  }
  const chain = chainOf(records, candidate);
  if (chain === undefined)
    return { kind: "none", because: "predecessor chain is missing an earlier session" };
  const allowedSessions = new Set([
    currentSession,
    ...chain.map((record) => record.event.session.id),
  ]);

  const cutoff = currentEvent === undefined
    ? head
    : (() => {
        const currentRecord = records.find((record) => record.event.session.id === currentSession);
        return currentRecord?.transition ?? head;
      })();
  const interval = rangeCommits(repoRoot, candidate.effectiveStart, cutoff);
  for (const commit of interval) {
    const parents = commitParents(repoRoot, commit);
    if (parents === undefined)
      return { kind: "none", because: `could not inspect commit ${commit}` };
    if (parents.length > 1)
      return { kind: "none", because: `merge commit ${commit} is in the inherited range` };
    const attempt = attemptSessions(repoRoot, commit);
    const permittedAttempt = attempt.some((session) => allowedSessions.has(session));
    const briefTransition = chain.some((record) => record.transition === commit);
    if (!permittedAttempt && !briefTransition)
      return {
        kind: "none",
        because: `commit ${commit} has no Attempt trailer for this session chain`,
      };
    if (commitPaths(repoRoot, commit).includes(debriefPath(graph, node)))
      return { kind: "none", because: `predecessor debrief is committed in ${commit}` };
  }

  const outcomeAfterStart = events.some(
    (event, index) =>
      index > candidate.journalIndex &&
      (currentJournalIndex === undefined || index < currentJournalIndex) &&
      event.kind === "outcome-set" &&
      event.node.graph === graph &&
      event.node.id === node,
  );
  if (outcomeAfterStart)
    return { kind: "none", because: "predecessor has a later outcome-set event" };
  const filedAfterStart = events.some(
    (event, index) =>
      index > candidate.journalIndex &&
      (currentJournalIndex === undefined || index < currentJournalIndex) &&
      event.kind === "debrief-filed" &&
      event.session === candidate.event.session.id,
  );
  if (filedAfterStart)
    return { kind: "none", because: "predecessor has a filed debrief" };

  if (currentEvent !== undefined) {
    if (
      currentEvent.inheritedStartSha !== candidate.effectiveStart ||
      currentEvent.predecessorSession !== candidate.event.session.id
    )
      return { kind: "none", because: "current session inheritance does not match its predecessor" };
  }
  return {
    kind: "inherited",
    inheritedStartSha: candidate.effectiveStart,
    predecessorSession: candidate.event.session.id,
  };
}
