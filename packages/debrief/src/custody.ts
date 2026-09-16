import { lstat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

function isSegment(value: string): boolean {
  return value.length > 0 && value !== "." && value !== ".." && !value.includes("/") && !value.includes("\\");
}

export function isSafeGraphId(value: string): boolean {
  return isSegment(value);
}

export function isSafeNodeId(value: string): boolean {
  return value.split("/").every(isSegment) && !value.includes("\\");
}

function isWithin(directory: string, path: string): boolean {
  const pathRelative = relative(directory, path);
  return pathRelative === "" || (pathRelative !== ".." && !pathRelative.startsWith(`..${sep}`));
}

function because(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function directDirectory(path: string): Promise<string | undefined> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink()) return "refuses symbolic links";
    if (!status.isDirectory()) return "is not a directory";
    return undefined;
  } catch (error) {
    return because(error);
  }
}

export async function directRegular(path: string): Promise<string | undefined> {
  try {
    const status = await lstat(path);
    if (status.isSymbolicLink()) return "refuses symbolic links";
    if (!status.isFile()) return "is not a regular file";
    return undefined;
  } catch (error) {
    return because(error);
  }
}

export async function sessionPathIsDirect(
  repoRoot: string,
  sessionPath: string,
): Promise<string | undefined> {
  if (!isWithin(repoRoot, sessionPath)) return "escapes the repository root";
  let path = repoRoot;
  const rootRefusal = await directDirectory(path);
  if (rootRefusal !== undefined) return `${path}: ${rootRefusal}`;
  for (const segment of relative(repoRoot, sessionPath).split(sep)) {
    path = resolve(path, segment);
    const refusal = await directDirectory(path);
    if (refusal !== undefined) return `${path}: ${refusal}`;
  }
  return undefined;
}

export async function candidatePathIsDirect(
  sessionPath: string,
  candidatePath: string,
): Promise<string | undefined> {
  if (!isWithin(sessionPath, candidatePath)) return "escapes this session directory";
  let path = sessionPath;
  for (const segment of relative(sessionPath, resolve(candidatePath, "..")).split(sep)) {
    if (segment.length === 0) continue;
    path = resolve(path, segment);
    const refusal = await directDirectory(path);
    if (refusal !== undefined) return `${path}: ${refusal}`;
  }
  return directRegular(candidatePath);
}

export async function candidatePathIsAbsent(
  sessionPath: string,
  candidatePath: string,
): Promise<string | undefined> {
  if (!isWithin(sessionPath, candidatePath)) return "escapes this session directory";
  let path = sessionPath;
  for (const segment of relative(sessionPath, resolve(candidatePath, "..")).split(sep)) {
    if (segment.length === 0) continue;
    path = resolve(path, segment);
    const refusal = await directDirectory(path);
    if (refusal !== undefined) return `${path}: ${refusal}`;
  }
  try {
    await lstat(candidatePath);
    return "already exists";
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    return because(error);
  }
}
