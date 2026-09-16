import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import { type BriefFrontMatter, type BriefRead, readBriefDocument } from "debrief";
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

export function gitCommit(repoRoot: string, sha: string): boolean {
  return gitText(repoRoot, ["cat-file", "-t", sha]) === "commit";
}

export function gitAncestor(repoRoot: string, ancestor: string, descendant: string): boolean {
  return gitText(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]) !== undefined;
}

export function gitHead(repoRoot: string): string | undefined {
  const head = gitText(repoRoot, ["rev-parse", "HEAD"]);
  return head !== undefined && gitCommit(repoRoot, head) ? head : undefined;
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

async function readStrictJournal(directory: string): Promise<readonly LedgerEvent[] | string> {
  let raw: string;
  try {
    raw = await readFile(journalPath(directory), "utf-8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    return "could not read the shared journal";
  }
  if (raw.length > 0 && !raw.endsWith("\n")) return "journal is torn at its final line";
  if (raw.length === 0) return [];
  const events: LedgerEvent[] = [];
  for (const [index, line] of raw.slice(0, -1).split("\n").entries()) {
    if (line.trim().length === 0) return `journal is corrupt at line ${index + 1}`;
    const parsed = parseLine(line);
    if (parsed.kind !== "event") return `journal is corrupt at line ${index + 1}`;
    events.push(parsed.event);
  }
  return events;
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

function hasSessionIdentity(
  graph: string,
  node: string,
  brief: BriefFrontMatter,
  read: BriefRead,
): boolean {
  if (read.kind !== "v1" || read.frontMatter.runner.kind !== "worktree") return false;
  if (brief.runner.kind !== "worktree") return false;
  return (
    read.frontMatter.graph === graph &&
    read.frontMatter.node === node &&
    read.frontMatter.role === brief.role &&
    read.frontMatter.runner.graphBaseSha === brief.runner.graphBaseSha &&
    read.frontMatter.runner.session === brief.runner.session
  );
}

export type DerivedSessionStart =
  | { readonly kind: "derived"; readonly sha: string }
  | { readonly kind: "refusal"; readonly because: string };

export async function deriveSessionStart(
  repoRoot: string,
  graph: string,
  node: string,
  brief: BriefFrontMatter,
  briefBytes: Buffer,
  head: string,
): Promise<DerivedSessionStart> {
  if (brief.runner.kind !== "worktree")
    return { kind: "refusal", because: "requires a worktree brief@v1" };
  if (!gitCommit(repoRoot, head))
    return { kind: "refusal", because: "source head is not a commit" };
  const runner = brief.runner;
  if (!gitAncestor(repoRoot, runner.graphBaseSha, head))
    return { kind: "refusal", because: "source head is not descended from the graph base" };

  const journal = journalDirectory(repoRoot);
  if (journal === undefined)
    return { kind: "refusal", because: "could not locate the shared journal" };
  const journalRead = await readStrictJournal(journal);
  if (typeof journalRead === "string") return { kind: "refusal", because: journalRead };
  const starts = journalRead.filter(
    (event) => event.kind === "session-started" && event.session.id === runner.session,
  );
  if (starts.length !== 1)
    return { kind: "refusal", because: "requires exactly one session-started event" };
  const started = starts[0];
  if (started === undefined || started.kind !== "session-started")
    return { kind: "refusal", because: "requires exactly one session-started event" };
  if (started.session.node.graph !== graph || started.session.node.id !== node)
    return { kind: "refusal", because: "session-started event does not name this graph and node" };
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
    return { kind: "refusal", because: "session-started event does not match the local brief" };
  }
  if (started.graphBaseSha !== runner.graphBaseSha)
    return {
      kind: "refusal",
      because: "session-started event graph base does not match the local brief",
    };

  const graphBytes = gitBytes(repoRoot, [
    "show",
    `${runner.graphBaseSha}:.interlock/graphs/${graph}.yaml`,
  ]);
  if (graphBytes === undefined)
    return { kind: "refusal", because: "graph base does not contain this graph" };
  const graphDocument = loadGraphDocumentText(
    graphBytes.toString("utf-8"),
    `${runner.graphBaseSha}:.interlock/graphs/${graph}.yaml`,
  );
  if (isErr(graphDocument)) return { kind: "refusal", because: "graph base graph is invalid" };
  const graphNode = graphDocument.value.nodes.find((entry) => entry.id === node);
  if (graphNode?.acceptance !== started.brief.acceptance)
    return {
      kind: "refusal",
      because: "session-started event acceptance does not match the graph base",
    };

  const history = gitText(repoRoot, [
    "rev-list",
    "--reverse",
    "--ancestry-path",
    `${runner.graphBaseSha}..${head}`,
  ]);
  if (history === undefined) return { kind: "refusal", because: "could not read Git history" };
  const startsAt: { readonly sha: string; readonly bytes: Buffer }[] = [];
  for (const commit of history.split("\n").filter((value) => value.length > 0)) {
    const child = briefAt(repoRoot, commit, graph, node);
    if (child === undefined || !hasSessionIdentity(graph, node, brief, child.read)) continue;
    const parents = gitText(repoRoot, ["show", "-s", "--format=%P", commit]);
    if (parents === undefined || parents.length === 0) continue;
    const parentHasIdentity = parents.split(" ").some((parent) => {
      const parentBrief = briefAt(repoRoot, parent, graph, node);
      return parentBrief !== undefined && hasSessionIdentity(graph, node, brief, parentBrief.read);
    });
    if (!parentHasIdentity) startsAt.push({ sha: commit, bytes: child.bytes });
  }
  if (startsAt.length !== 1)
    return { kind: "refusal", because: "requires one unambiguous brief transition" };
  const derived = startsAt[0];
  if (derived === undefined)
    return { kind: "refusal", because: "requires one unambiguous brief transition" };
  if (!derived.bytes.equals(briefBytes))
    return { kind: "refusal", because: "local brief bytes changed after the session started" };
  return { kind: "derived", sha: derived.sha };
}
