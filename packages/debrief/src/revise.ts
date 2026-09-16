import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { type BriefFrontMatter, explainBriefRefusal, readBriefFile } from "./brief.ts";
import { type DebriefRead, explainDebriefRefusal, readDebriefFile } from "./debrief.ts";
import { debriefFilePath, debriefRevisionsDirectory, sessionDirectory } from "./paths.ts";
import { candidatePathIsDirect, directRegular, isSafeGraphId, isSafeNodeId, sessionPathIsDirect } from "./custody.ts";

export type DebriefRevisionRefusal =
  | { readonly kind: "session-path"; readonly path: string; readonly because: string }
  | { readonly kind: "candidate-path"; readonly path: string; readonly because: string }
  | { readonly kind: "current-read"; readonly path: string; readonly because: string }
  | { readonly kind: "candidate-read"; readonly path: string; readonly because: string }
  | { readonly kind: "brief-read"; readonly path: string; readonly because: string }
  | { readonly kind: "identity"; readonly because: string }
  | { readonly kind: "archive-collision"; readonly path: string }
  | { readonly kind: "write-failed"; readonly path: string; readonly because: string };

export type DebriefRevisionOutcome =
  | {
      readonly kind: "selected";
      readonly currentPath: string;
      readonly candidatePath: string;
      readonly archivePath: string;
    }
  | {
      readonly kind: "already-current";
      readonly currentPath: string;
      readonly candidatePath: string;
    };

export interface DebriefRevisionOptions {
  readonly install?: (temporaryPath: string, currentPath: string) => Promise<void>;
  readonly recoverSessionStart?: (input: SessionStartRecoveryInput) => Promise<string | undefined>;
}

export interface SessionStartRecoveryInput {
  readonly repoRoot: string;
  readonly graph: string;
  readonly node: string;
  readonly brief: BriefFrontMatter;
  readonly briefBytes: Buffer;
  readonly current: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"];
  readonly candidate: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"];
}

export function explainDebriefRevisionRefusal(refusal: DebriefRevisionRefusal): string {
  switch (refusal.kind) {
    case "session-path":
    case "candidate-path":
    case "current-read":
    case "candidate-read":
    case "brief-read":
    case "write-failed":
      return `${refusal.path}: ${refusal.because}`;
    case "identity":
      return `debrief revise: ${refusal.because}`;
    case "archive-collision":
      return `${refusal.path}: immutable revision collision with different bytes.`;
  }
}

function because(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sameIdentity(
  current: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"],
  candidate: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"],
  graph: string,
  node: string,
  role: string,
  graphBaseSha: string,
  requireMatchingSessionStartSha: boolean,
): string | undefined {
  if (current.graph !== graph || candidate.graph !== graph) return `graph must be "${graph}"`;
  if (current.node !== node || candidate.node !== node) return `node must be "${node}"`;
  if (current.role !== role || candidate.role !== role) return `role must be "${role}"`;
  if (current.graphBaseSha !== graphBaseSha || candidate.graphBaseSha !== graphBaseSha)
    return "graph_base_sha does not match the session brief";
  if (requireMatchingSessionStartSha && current.sessionStartSha !== candidate.sessionStartSha)
    return "session_start_sha does not match the current debrief";
  return undefined;
}

function revisionPath(revisionsPath: string, bytes: Buffer): string {
  const digest = createHash("sha256").update(bytes).digest("hex");
  return resolve(revisionsPath, `${digest}.yaml`);
}

async function retainCurrent(
  path: string,
  bytes: Buffer,
): Promise<string | DebriefRevisionRefusal> {
  try {
    await writeFile(path, bytes, { flag: "wx" });
    await chmod(path, 0o444);
    return path;
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
      return { kind: "write-failed", path, because: because(error) };
    }
    const existing = await directRegular(path);
    if (existing !== undefined) return { kind: "write-failed", path, because: existing };
    const retained = await readFile(path);
    return retained.equals(bytes) ? path : { kind: "archive-collision", path };
  }
}

export async function reviseDebrief(
  repoRoot: string,
  graph: string,
  node: string,
  candidate: string,
  options: DebriefRevisionOptions = {},
): Promise<Result<DebriefRevisionOutcome, DebriefRevisionRefusal>> {
  if (!isSafeGraphId(graph) || !isSafeNodeId(node)) {
    return err({
      kind: "session-path",
      path: repoRoot,
      because: "graph and node must each be one non-traversing path segment",
    });
  }
  const sessionPath = sessionDirectory(repoRoot, graph, node);
  const sessionRefusal = await sessionPathIsDirect(repoRoot, sessionPath);
  if (sessionRefusal !== undefined)
    return err({ kind: "session-path", path: sessionPath, because: sessionRefusal });

  const candidatePath = resolve(repoRoot, candidate);
  const candidateRefusal = await candidatePathIsDirect(sessionPath, candidatePath);
  if (candidateRefusal !== undefined)
    return err({ kind: "candidate-path", path: candidatePath, because: candidateRefusal });

  const currentPath = debriefFilePath(repoRoot, graph, node);
  const currentPathRefusal = await directRegular(currentPath);
  if (currentPathRefusal !== undefined)
    return err({ kind: "current-read", path: currentPath, because: currentPathRefusal });

  const briefPath = resolve(sessionPath, "brief.md");
  const briefPathRefusal = await directRegular(briefPath);
  if (briefPathRefusal !== undefined)
    return err({ kind: "brief-read", path: briefPath, because: briefPathRefusal });
  const briefRead = await readBriefFile(briefPath);
  if (isErr(briefRead))
    return err({
      kind: "brief-read",
      path: briefPath,
      because: explainBriefRefusal(briefRead.error),
    });
  if (briefRead.value.kind !== "v1" || briefRead.value.frontMatter.runner.kind !== "worktree")
    return err({ kind: "brief-read", path: briefPath, because: "requires a worktree brief@v1" });
  if (briefRead.value.frontMatter.graph !== graph || briefRead.value.frontMatter.node !== node)
    return err({
      kind: "brief-read",
      path: briefPath,
      because: "does not name this graph and node",
    });

  const currentRead = await readDebriefFile(currentPath);
  if (isErr(currentRead))
    return err({
      kind: "current-read",
      path: currentPath,
      because: explainDebriefRefusal(currentRead.error),
    });
  const candidateRead = await readDebriefFile(candidatePath);
  if (isErr(candidateRead))
    return err({
      kind: "candidate-read",
      path: candidatePath,
      because: explainDebriefRefusal(candidateRead.error),
    });
  if (currentRead.value.kind !== "v2")
    return err({ kind: "current-read", path: currentPath, because: "requires debrief@v2" });
  if (candidateRead.value.kind !== "v2")
    return err({ kind: "candidate-read", path: candidatePath, because: "requires debrief@v2" });

  const identityRefusal = sameIdentity(
    currentRead.value.debrief,
    candidateRead.value.debrief,
    graph,
    node,
    briefRead.value.frontMatter.role,
    briefRead.value.frontMatter.runner.graphBaseSha,
    options.recoverSessionStart === undefined,
  );
  if (identityRefusal !== undefined) return err({ kind: "identity", because: identityRefusal });

  let briefBytes: Buffer;
  try {
    briefBytes = await readFile(briefPath);
  } catch (error) {
    return err({ kind: "brief-read", path: briefPath, because: because(error) });
  }
  if (options.recoverSessionStart !== undefined) {
    const recoveryRefusal = await options.recoverSessionStart({
      repoRoot,
      graph,
      node,
      brief: briefRead.value.frontMatter,
      briefBytes,
      current: currentRead.value.debrief,
      candidate: candidateRead.value.debrief,
    });
    if (recoveryRefusal !== undefined) return err({ kind: "identity", because: recoveryRefusal });
  }

  let currentBytes: Buffer;
  let candidateBytes: Buffer;
  try {
    currentBytes = await readFile(currentPath);
    candidateBytes = await readFile(candidatePath);
  } catch (error) {
    return err({ kind: "write-failed", path: currentPath, because: because(error) });
  }

  const revisionsPath = debriefRevisionsDirectory(repoRoot, graph, node);
  const archivePath = revisionPath(revisionsPath, currentBytes);
  if (currentBytes.equals(candidateBytes))
    return ok({ kind: "already-current", currentPath, candidatePath });
  try {
    await mkdir(revisionsPath, { recursive: true });
  } catch (error) {
    return err({ kind: "write-failed", path: revisionsPath, because: because(error) });
  }
  const revisionsRefusal = await sessionPathIsDirect(repoRoot, revisionsPath);
  if (revisionsRefusal !== undefined)
    return err({ kind: "session-path", path: revisionsPath, because: revisionsRefusal });

  const retained = await retainCurrent(archivePath, currentBytes);
  if (typeof retained !== "string") return err(retained);

  const temporaryPath = resolve(sessionPath, `.${basename(currentPath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, candidateBytes, { flag: "wx" });
    await (options.install ?? rename)(temporaryPath, currentPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    return err({ kind: "write-failed", path: currentPath, because: because(error) });
  }
  return ok({ kind: "selected", currentPath, candidatePath, archivePath });
}
