import { randomUUID } from "node:crypto";
import { link, readFile, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import {
  type BriefFrontMatter,
  candidatePathIsAbsent,
  candidatePathIsDirect,
  debriefFilePath,
  directRegular,
  explainBriefRefusal,
  explainDebriefRefusal,
  isSafeGraphId,
  isSafeNodeId,
  readBriefFile,
  readDebriefDocument,
  sessionDirectory,
  sessionPathIsDirect,
} from "debrief";
import { stringify } from "yaml";
import { findRepoRoot } from "face";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";
import { deriveSessionStart, gitAncestor, gitHead } from "./sessionIdentity.ts";

type Authorship =
  | { readonly kind: "agent"; readonly runtime: string; readonly model: string }
  | { readonly kind: "human"; readonly who: string };

interface SessionBrief {
  readonly path: string;
  readonly bytes: Buffer;
  readonly frontMatter: BriefFrontMatter;
}

function because(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSessionBrief(
  repoRoot: string,
  graph: string,
  node: string,
): Promise<SessionBrief | string> {
  if (!isSafeGraphId(graph) || !isSafeNodeId(node))
    return "graph must be one non-traversing path segment and node must be non-traversing path segments";
  const session = sessionDirectory(repoRoot, graph, node);
  const sessionRefusal = await sessionPathIsDirect(repoRoot, session);
  if (sessionRefusal !== undefined) return sessionRefusal;
  const path = resolve(session, "brief.md");
  const pathRefusal = await directRegular(path);
  if (pathRefusal !== undefined) return `${path}: ${pathRefusal}`;
  const read = await readBriefFile(path);
  if (isErr(read)) return explainBriefRefusal(read.error);
  if (read.value.kind !== "v1" || read.value.frontMatter.runner.kind !== "worktree")
    return "requires a worktree brief@v1";
  if (read.value.frontMatter.graph !== graph || read.value.frontMatter.node !== node)
    return "does not name this graph and node";
  try {
    return { path, bytes: await readFile(path), frontMatter: read.value.frontMatter };
  } catch (error) {
    return `${path}: ${because(error)}`;
  }
}

function authorship(args: readonly string[]): Authorship | string {
  const runtime = parseFlag(args, "--agent-runtime");
  const model = parseFlag(args, "--agent-model");
  const human = parseFlag(args, "--human");
  if (human !== undefined && (runtime !== undefined || model !== undefined))
    return "requires either --agent-runtime with --agent-model, or --human, not both";
  if (human !== undefined) return human.length > 0 ? { kind: "human", who: human } : "--human must be nonempty";
  if (runtime === undefined || model === undefined)
    return "requires --agent-runtime <runtime> and --agent-model <model>, or --human <name>";
  if (runtime.length === 0 || model.length === 0) return "agent runtime and model must be nonempty";
  return { kind: "agent", runtime, model };
}

function declaredAuthorshipIsNonempty(derivation: Authorship): boolean {
  return derivation.kind === "agent"
    ? derivation.runtime.length > 0 && derivation.model.length > 0
    : derivation.who.length > 0;
}

function candidateDocument(
  graph: string,
  node: string,
  brief: BriefFrontMatter,
  start: string,
  head: string,
  derivation: Authorship,
): string {
  if (brief.runner.kind !== "worktree") throw new Error("worktree brief required");
  return stringify({
    interlock: "debrief@v2",
    graph,
    node,
    role: brief.role,
    graph_base_sha: brief.runner.graphBaseSha,
    session_start_sha: start,
    head_sha: head,
    derivation,
    discoveries: [],
    decisions: [],
    gates_run_by_agent: [],
    open: [],
  });
}

function repo(cwd: string): { readonly root: string } | CommandResult {
  const root = findRepoRoot(cwd);
  return root === undefined
    ? { exitCode: 1, message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.` }
    : { root };
}

export async function runDebriefPrepare(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined)
    return { exitCode: 1, message: "interlock debrief prepare: expected a graph id and node id." };
  const to = parseFlag(args, "--to");
  if (to === undefined) return { exitCode: 1, message: "interlock debrief prepare: refuses without --to <candidate-path>." };
  const declared = authorship(args);
  if (typeof declared === "string") return { exitCode: 1, message: `interlock debrief prepare: ${declared}.` };
  const cwd = options.cwd ?? process.cwd();
  const repository = repo(cwd);
  if ("exitCode" in repository) return repository;
  const brief = await readSessionBrief(repository.root, graph, node);
  if (typeof brief === "string") return { exitCode: 1, message: `interlock debrief prepare: ${brief}.` };
  const session = sessionDirectory(repository.root, graph, node);
  const candidate = resolve(repository.root, to);
  if (candidate === debriefFilePath(repository.root, graph, node))
    return { exitCode: 1, message: "interlock debrief prepare: refuses debrief.yaml as a candidate target." };
  const pathRefusal = await candidatePathIsAbsent(session, candidate);
  if (pathRefusal !== undefined)
    return { exitCode: 1, message: `interlock debrief prepare: ${candidate}: ${pathRefusal}.` };
  const head = gitHead(repository.root);
  if (head === undefined) return { exitCode: 1, message: "interlock debrief prepare: source head is not a commit." };
  const start = await deriveSessionStart(repository.root, graph, node, brief.frontMatter, brief.bytes, head);
  if (start.kind === "refusal") return { exitCode: 1, message: `interlock debrief prepare: ${start.because}.` };
  try {
    await writeFile(candidate, candidateDocument(graph, node, brief.frontMatter, start.sha, head, declared), { flag: "wx" });
  } catch (error) {
    return { exitCode: 1, message: `interlock debrief prepare: ${candidate}: ${because(error)}.` };
  }
  return { exitCode: 0, message: `${graph}/${node}: prepared ${candidate}; author claims and reports, then file it with interlock debrief file-derived ${graph} ${node} --from ${candidate}.` };
}

export async function runDebriefFileDerived(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined)
    return { exitCode: 1, message: "interlock debrief file-derived: expected a graph id and node id." };
  const from = parseFlag(args, "--from");
  if (from === undefined) return { exitCode: 1, message: "interlock debrief file-derived: refuses without --from <candidate-path>." };
  const cwd = options.cwd ?? process.cwd();
  const repository = repo(cwd);
  if ("exitCode" in repository) return repository;
  const brief = await readSessionBrief(repository.root, graph, node);
  if (typeof brief === "string") return { exitCode: 1, message: `interlock debrief file-derived: ${brief}.` };
  const session = sessionDirectory(repository.root, graph, node);
  const candidate = resolve(repository.root, from);
  const current = debriefFilePath(repository.root, graph, node);
  if (candidate === current)
    return { exitCode: 1, message: "interlock debrief file-derived: refuses debrief.yaml as a candidate source." };
  const pathRefusal = await candidatePathIsDirect(session, candidate);
  if (pathRefusal !== undefined)
    return { exitCode: 1, message: `interlock debrief file-derived: ${candidate}: ${pathRefusal}.` };
  let bytes: Buffer;
  try {
    bytes = await readFile(candidate);
  } catch (error) {
    return { exitCode: 1, message: `interlock debrief file-derived: ${candidate}: ${because(error)}.` };
  }
  const read = readDebriefDocument(bytes.toString("utf-8"), candidate);
  if (isErr(read) || read.value.kind !== "v2")
    return { exitCode: 1, message: `interlock debrief file-derived: ${isErr(read) ? explainDebriefRefusal(read.error) : "requires debrief@v2"}.` };
  const head = gitHead(repository.root);
  if (head === undefined) return { exitCode: 1, message: "interlock debrief file-derived: source head is not a commit." };
  const start = await deriveSessionStart(repository.root, graph, node, brief.frontMatter, brief.bytes, head);
  if (start.kind === "refusal") return { exitCode: 1, message: `interlock debrief file-derived: ${start.because}.` };
  const debrief = read.value.debrief;
  if (!declaredAuthorshipIsNonempty(debrief.derivation))
    return { exitCode: 1, message: "interlock debrief file-derived: candidate derivation must be nonempty authored input." };
  if (
    debrief.graph !== graph || debrief.node !== node || debrief.role !== brief.frontMatter.role ||
    brief.frontMatter.runner.kind !== "worktree" || debrief.graphBaseSha !== brief.frontMatter.runner.graphBaseSha ||
    debrief.sessionStartSha !== start.sha || debrief.headSha !== head || !gitAncestor(repository.root, start.sha, debrief.headSha)
  ) return { exitCode: 1, message: "interlock debrief file-derived: candidate identity does not match the current derived proof." };
  const temporary = resolve(session, `.${basename(current)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: "wx" });
    await link(temporary, current);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    return { exitCode: 1, message: `interlock debrief file-derived: ${current}: ${because(error)}.` };
  }
  await unlink(temporary).catch(() => undefined);
  return { exitCode: 0, message: `${graph}/${node}: filed derived candidate at ${current}; source ${candidate} remains authored and no revision was created.` };
}
