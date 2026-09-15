import { createHash, randomUUID } from "node:crypto";
import { chmod, lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { explainBriefRefusal, readBriefFile } from "./brief.ts";
import { type DebriefRead, explainDebriefRefusal, readDebriefFile } from "./debrief.ts";
import { debriefFilePath, debriefRevisionsDirectory, sessionDirectory } from "./paths.ts";

export type DebriefRevisionRefusal =
  | { readonly kind: "session-path"; readonly path: string; readonly because: string }
  | { readonly kind: "candidate-path"; readonly path: string; readonly because: string }
  | { readonly kind: "current-read"; readonly path: string; readonly because: string }
  | { readonly kind: "candidate-read"; readonly path: string; readonly because: string }
  | { readonly kind: "brief-read"; readonly path: string; readonly because: string }
  | { readonly kind: "identity"; readonly because: string }
  | { readonly kind: "archive-collision"; readonly path: string }
  | { readonly kind: "write-failed"; readonly path: string; readonly because: string };

export interface DebriefRevisionOutcome {
  readonly currentPath: string;
  readonly candidatePath: string;
  readonly archivePath: string;
  readonly changed: boolean;
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

function isWithin(directory: string, path: string): boolean {
  const pathRelative = relative(directory, path);
  return pathRelative === "" || (pathRelative !== ".." && !pathRelative.startsWith(`..${sep}`));
}

function because(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function isRegularPath(path: string): Promise<string | undefined> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink()) return "refuses symbolic links";
    if (!status.isFile()) return "is not a regular file";
    return undefined;
  } catch (error) {
    return because(error);
  }
}

async function isDirectDirectory(path: string): Promise<string | undefined> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink()) return "refuses symbolic links";
    if (!status.isDirectory()) return "is not a directory";
    return undefined;
  } catch (error) {
    return because(error);
  }
}

async function sessionPathIsDirect(
  repoRoot: string,
  sessionPath: string,
): Promise<string | undefined> {
  if (!isWithin(repoRoot, sessionPath)) return "escapes the repository root";
  const paths = [repoRoot];
  let path = repoRoot;
  for (const segment of relative(repoRoot, sessionPath).split(sep)) {
    path = resolve(path, segment);
    paths.push(path);
  }
  for (const candidate of paths) {
    const refusal = await isDirectDirectory(candidate);
    if (refusal !== undefined) return `${candidate}: ${refusal}`;
  }
  return undefined;
}

async function candidatePathIsDirect(
  sessionPath: string,
  candidatePath: string,
): Promise<string | undefined> {
  if (!isWithin(sessionPath, candidatePath)) return "escapes this session directory";
  const parent = resolve(candidatePath, "..");
  let path = sessionPath;
  for (const segment of relative(sessionPath, parent).split(sep)) {
    if (segment.length === 0) continue;
    path = resolve(path, segment);
    const refusal = await isDirectDirectory(path);
    if (refusal !== undefined) return `${path}: ${refusal}`;
  }
  return isRegularPath(candidatePath);
}

function sameIdentity(
  current: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"],
  candidate: Extract<DebriefRead, { readonly kind: "v2" }>["debrief"],
  graph: string,
  node: string,
  role: string,
  graphBaseSha: string,
): string | undefined {
  if (current.graph !== graph || candidate.graph !== graph) return `graph must be "${graph}"`;
  if (current.node !== node || candidate.node !== node) return `node must be "${node}"`;
  if (current.role !== role || candidate.role !== role) return `role must be "${role}"`;
  if (current.graphBaseSha !== graphBaseSha || candidate.graphBaseSha !== graphBaseSha)
    return "graph_base_sha does not match the session brief";
  if (current.sessionStartSha !== candidate.sessionStartSha)
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
    const existing = await isRegularPath(path);
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
): Promise<Result<DebriefRevisionOutcome, DebriefRevisionRefusal>> {
  const sessionPath = sessionDirectory(repoRoot, graph, node);
  const sessionRefusal = await sessionPathIsDirect(repoRoot, sessionPath);
  if (sessionRefusal !== undefined)
    return err({ kind: "session-path", path: sessionPath, because: sessionRefusal });

  const candidatePath = resolve(repoRoot, candidate);
  const candidateRefusal = await candidatePathIsDirect(sessionPath, candidatePath);
  if (candidateRefusal !== undefined)
    return err({ kind: "candidate-path", path: candidatePath, because: candidateRefusal });

  const currentPath = debriefFilePath(repoRoot, graph, node);
  const currentPathRefusal = await isRegularPath(currentPath);
  if (currentPathRefusal !== undefined)
    return err({ kind: "current-read", path: currentPath, because: currentPathRefusal });

  const briefPath = resolve(sessionPath, "brief.md");
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
  );
  if (identityRefusal !== undefined) return err({ kind: "identity", because: identityRefusal });

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
    return ok({ currentPath, candidatePath, archivePath, changed: false });
  try {
    await mkdir(revisionsPath, { recursive: true });
  } catch (error) {
    return err({ kind: "write-failed", path: revisionsPath, because: because(error) });
  }
  const revisionsRefusal = await isDirectDirectory(revisionsPath);
  if (revisionsRefusal !== undefined)
    return err({ kind: "session-path", path: revisionsPath, because: revisionsRefusal });

  const retained = await retainCurrent(archivePath, currentBytes);
  if (typeof retained !== "string") return err(retained);

  const temporaryPath = resolve(sessionPath, `.${basename(currentPath)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporaryPath, candidateBytes, { flag: "wx" });
    await rename(temporaryPath, currentPath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    return err({ kind: "write-failed", path: currentPath, because: because(error) });
  }
  return ok({ currentPath, candidatePath, archivePath, changed: true });
}
