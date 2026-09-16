import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { type BriefRead, readBriefDocument, type SessionStartRecoveryInput } from "debrief";
import { loadGraphDocumentText } from "face";
import { journalPath, type LedgerEvent, parseLine } from "ledger";

function gitText(repoRoot: string, args: readonly string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return undefined;
  }
}

function gitBytes(repoRoot: string, args: readonly string[]): Buffer | undefined {
  try {
    return execFileSync("git", args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    return undefined;
  }
}

function isCommit(repoRoot: string, sha: string): boolean {
  return gitText(repoRoot, ["cat-file", "-t", sha]) === "commit";
}

function isAncestor(repoRoot: string, ancestor: string, descendant: string): boolean {
  return gitText(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]) !== undefined;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function briefPath(graph: string, node: string): string {
  return `.interlock/sessions/${graph}/${node}/brief.md`;
}

function journalDirectory(repoRoot: string): string | undefined {
  const commonDirectory = gitText(repoRoot, ["rev-parse", "--git-common-dir"]);
  return commonDirectory === undefined
    ? undefined
    : join(dirname(resolve(repoRoot, commonDirectory)), ".interlock", "ledger");
}

type StrictJournalRead =
  | { readonly kind: "events"; readonly events: readonly LedgerEvent[] }
  | { readonly kind: "refusal"; readonly because: string };

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function readStrictJournal(directory: string): Promise<StrictJournalRead> {
  let raw: string;
  try {
    raw = await readFile(journalPath(directory), "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return { kind: "events", events: [] };
    return { kind: "refusal", because: "could not read the shared journal" };
  }
  if (raw.length > 0 && !raw.endsWith("\n")) {
    return { kind: "refusal", because: "journal is torn at its final line" };
  }
  const lines = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n");
  if (raw.length === 0) return { kind: "events", events: [] };
  const events: LedgerEvent[] = [];
  for (const [index, line] of lines.entries()) {
    if (line.trim().length === 0) {
      return { kind: "refusal", because: `journal is corrupt at line ${index + 1}` };
    }
    const parsed = parseLine(line);
    if (parsed.kind !== "event") {
      return { kind: "refusal", because: `journal is corrupt at line ${index + 1}` };
    }
    events.push(parsed.event);
  }
  return { kind: "events", events };
}

function briefAt(
  repoRoot: string,
  sha: string,
  graph: string,
  node: string,
): { readonly read: BriefRead; readonly bytes: Buffer } | undefined {
  const bytes = gitBytes(repoRoot, ["show", `${sha}:${briefPath(graph, node)}`]);
  if (bytes === undefined) return undefined;
  const read = readBriefDocument(bytes.toString("utf-8"), briefPath(graph, node));
  return isErr(read) ? undefined : { read: read.value, bytes };
}

function hasSessionIdentity(input: SessionStartRecoveryInput, read: BriefRead): boolean {
  if (read.kind !== "v1" || read.frontMatter.runner.kind !== "worktree") return false;
  if (input.brief.runner.kind !== "worktree") return false;
  return (
    read.frontMatter.graph === input.graph &&
    read.frontMatter.node === input.node &&
    read.frontMatter.role === input.brief.role &&
    read.frontMatter.runner.graphBaseSha === input.brief.runner.graphBaseSha &&
    read.frontMatter.runner.session === input.brief.runner.session
  );
}

export async function recoverSessionStart(
  input: SessionStartRecoveryInput,
): Promise<string | undefined> {
  const { repoRoot, graph, node, brief, briefBytes, current, candidate } = input;
  if (isCommit(repoRoot, current.sessionStartSha)) {
    return "recovery requires the current session_start_sha not to name a commit";
  }
  if (brief.runner.kind !== "worktree") return "recovery requires a worktree brief@v1";
  const runner = brief.runner;

  const journal = journalDirectory(repoRoot);
  if (journal === undefined) return "recovery could not locate the shared journal";
  const journalRead = await readStrictJournal(journal);
  if (journalRead.kind === "refusal") return `recovery ${journalRead.because}`;

  const starts = journalRead.events.filter(
    (event) => event.kind === "session-started" && event.session.id === runner.session,
  );
  if (starts.length !== 1) return "recovery requires exactly one session-started event";
  const started = starts[0];
  if (started === undefined || started.kind !== "session-started")
    return "recovery requires exactly one session-started event";
  if (started.session.node.graph !== graph || started.session.node.id !== node)
    return "session-started event does not name this graph and node";
  if (
    started.brief.graph !== graph ||
    started.brief.node !== node ||
    started.brief.role !== brief.role ||
    !sameStrings(
      started.brief.gates,
      brief.gates.map((gate) => gate.id),
    ) ||
    !sameStrings(started.brief.scope, brief.scope)
  ) {
    return "session-started event does not match the local brief";
  }
  if (started.graphBaseSha !== runner.graphBaseSha) {
    return "session-started event graph base does not match the local brief";
  }

  const graphBytes = gitBytes(repoRoot, [
    "show",
    `${runner.graphBaseSha}:.interlock/graphs/${graph}.yaml`,
  ]);
  if (graphBytes === undefined) return "recovery graph base does not contain this graph";
  const graphDocument = loadGraphDocumentText(
    graphBytes.toString("utf-8"),
    `${runner.graphBaseSha}:.interlock/graphs/${graph}.yaml`,
  );
  if (isErr(graphDocument)) return "recovery graph base graph is invalid";
  const graphNode = graphDocument.value.nodes.find((entry) => entry.id === node);
  if (graphNode?.acceptance !== started.brief.acceptance)
    return "session-started event acceptance does not match the graph base";

  if (!isCommit(repoRoot, candidate.headSha)) return "candidate head_sha is not a commit";
  if (!isAncestor(repoRoot, runner.graphBaseSha, candidate.headSha))
    return "candidate head_sha is not descended from the graph base";

  const history = gitText(repoRoot, [
    "rev-list",
    "--reverse",
    "--ancestry-path",
    `${runner.graphBaseSha}..${candidate.headSha}`,
  ]);
  if (history === undefined) return "recovery could not read Git history";
  const startsAt: { readonly sha: string; readonly bytes: Buffer }[] = [];
  for (const commit of history.split("\n").filter((value) => value.length > 0)) {
    if (!isAncestor(repoRoot, runner.graphBaseSha, commit)) continue;
    const child = briefAt(repoRoot, commit, graph, node);
    if (child === undefined || !hasSessionIdentity(input, child.read)) continue;
    const parents = gitText(repoRoot, ["show", "-s", "--format=%P", commit]);
    if (parents === undefined || parents.length === 0) continue;
    const parentHasIdentity = parents.split(" ").some((parent) => {
      const parentBrief = briefAt(repoRoot, parent, graph, node);
      return parentBrief !== undefined && hasSessionIdentity(input, parentBrief.read);
    });
    if (!parentHasIdentity) startsAt.push({ sha: commit, bytes: child.bytes });
  }
  if (startsAt.length !== 1) return "recovery requires one unambiguous brief transition";
  const derived = startsAt[0];
  if (derived === undefined) return "recovery requires one unambiguous brief transition";
  if (!derived.bytes.equals(briefBytes))
    return "local brief bytes changed after the session started";
  if (candidate.sessionStartSha !== derived.sha)
    return "candidate session_start_sha does not match the recovered session start";
  if (!isAncestor(repoRoot, derived.sha, candidate.headSha))
    return "candidate head_sha is not descended from the recovered session start";
  return undefined;
}
