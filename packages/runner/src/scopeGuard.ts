import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { WatchPath } from "./localConfig.ts";
import { execFileSyncOwned } from "./ownedCommand.ts";

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;
const EXCLUDED_ROOTS: readonly string[] = [".interlock/ledger", ".interlock/sessions"];

export interface ScopeSnapshotEntry {
  readonly root: "main checkout" | "watch path";
  readonly rootPath: string;
  readonly path: string;
  readonly present: boolean;
  readonly size: number | undefined;
  readonly mtimeMs: number | undefined;
  readonly sha256: string | undefined;
  readonly ownerOnly: boolean;
}

export interface ScopeSnapshot {
  readonly entries: readonly ScopeSnapshotEntry[];
}

export interface ScopeGuardChange {
  readonly root: ScopeSnapshotEntry["root"];
  readonly rootPath: string;
  readonly path: string;
  readonly ownerOnly: boolean;
}

export interface ScopeSnapshotRefusal {
  readonly path: string;
  readonly because: string;
}

export type ScopeSnapshotFileReader = (path: string) => Buffer;

export interface ScopeSnapshotOptions {
  readonly readFile?: ScopeSnapshotFileReader;
}

type SnapshotOptions = ScopeSnapshotOptions | ScopeSnapshotFileReader;

function gitCommonDirectory(worktreePath: string): Result<string, ScopeSnapshotRefusal> {
  try {
    const common = execFileSyncOwned(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        cwd: worktreePath,
        encoding: "utf-8",
        maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
      },
    ).trim();
    if (!isAbsolute(common) || common === "") {
      return err({
        path: worktreePath,
        because: `git returned a non-absolute common directory ${JSON.stringify(common)}`,
      });
    }
    return ok(common);
  } catch (error) {
    return err({
      path: worktreePath,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function isMainExcluded(path: string): boolean {
  return EXCLUDED_ROOTS.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

function changedMainPaths(
  mainRoot: string,
  worktreePath: string,
): Result<readonly string[], ScopeSnapshotRefusal> {
  try {
    const status = execFileSyncOwned(
      "git",
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      {
        cwd: mainRoot,
        encoding: "utf-8",
        maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
      },
    );
    const records = status.split("\0");
    const paths = new Set<string>();
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record === undefined || record === "") continue;
      const path = record.slice(3);
      if (!isMainExcluded(path) && !isInside(worktreePath, join(mainRoot, path))) paths.add(path);
      if (record.slice(0, 2).includes("R") || record.slice(0, 2).includes("C")) {
        const source = records[index + 1];
        index += 1;
        if (
          source !== undefined &&
          !isMainExcluded(source) &&
          !isInside(worktreePath, join(mainRoot, source))
        )
          paths.add(source);
      }
    }
    return ok([...paths].sort());
  } catch (error) {
    return err({
      path: mainRoot,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function fileEntry(
  root: ScopeSnapshotEntry["root"],
  rootPath: string,
  path: string,
  absolutePath: string,
  allowOwnerOnly: boolean,
  readFile: ScopeSnapshotFileReader,
): Result<ScopeSnapshotEntry, ScopeSnapshotRefusal> {
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      return err({ path: absolutePath, because: "the snapshot target is not a regular file" });
    }
    const ownerOnly = allowOwnerOnly && (stat.mode & 0o077) === 0;
    const mtimeMs = ownerOnly ? Math.trunc(stat.mtimeMs) : undefined;
    return ok({
      root,
      rootPath,
      path,
      present: true,
      size: stat.size,
      mtimeMs,
      sha256: ownerOnly
        ? undefined
        : createHash("sha256").update(readFile(absolutePath)).digest("hex"),
      ownerOnly,
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return ok({
        root,
        rootPath,
        path,
        present: false,
        size: undefined,
        mtimeMs: undefined,
        sha256: undefined,
        ownerOnly: false,
      });
    }
    return err({
      path: absolutePath,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function collectWatchFiles(
  rootPath: string,
  currentPath: string,
  files: string[],
  excludes: readonly string[],
): Result<void, ScopeSnapshotRefusal> {
  const path = relative(rootPath, currentPath);
  if (path !== "" && isWatchExcluded(path, excludes)) return ok(undefined);
  try {
    const stat = lstatSync(currentPath);
    if (stat.isFile() || stat.isSymbolicLink()) {
      files.push(relative(rootPath, currentPath));
      return ok(undefined);
    }
    if (!stat.isDirectory()) {
      return err({
        path: currentPath,
        because: "the watch path is neither a file nor a directory",
      });
    }
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      const next = join(currentPath, entry.name);
      const nextPath = relative(rootPath, next);
      if (isWatchExcluded(nextPath, excludes)) continue;
      const collected = collectWatchFiles(rootPath, next, files, excludes);
      if (isErr(collected)) return collected;
    }
    return ok(undefined);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return ok(undefined);
    }
    return err({
      path: currentPath,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function isWatchExcluded(path: string, excludes: readonly string[]): boolean {
  return excludes.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function watchEntries(
  watchPath: string,
  excludes: readonly string[],
  readFile: ScopeSnapshotFileReader,
): Result<readonly ScopeSnapshotEntry[], ScopeSnapshotRefusal> {
  let rootStat: ReturnType<typeof lstatSync>;
  try {
    rootStat = lstatSync(watchPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      const missing = fileEntry(
        "watch path",
        dirname(watchPath),
        basename(watchPath),
        watchPath,
        true,
        readFile,
      );
      return isErr(missing) ? missing : ok([missing.value]);
    }
    return err({
      path: watchPath,
      because: error instanceof Error ? error.message : String(error),
    });
  }
  if (rootStat.isFile() || rootStat.isSymbolicLink()) {
    if (excludes.length > 0) {
      return err({
        path: watchPath,
        because: "a file watch path cannot have excludes",
      });
    }
    const entry = fileEntry(
      "watch path",
      dirname(watchPath),
      basename(watchPath),
      watchPath,
      true,
      readFile,
    );
    return isErr(entry) ? entry : ok([entry.value]);
  }
  if (!rootStat.isDirectory()) {
    return err({ path: watchPath, because: "the watch path is neither a file nor a directory" });
  }
  const files: string[] = [];
  const collected = collectWatchFiles(watchPath, watchPath, files, excludes);
  if (isErr(collected)) return collected;
  const entries: ScopeSnapshotEntry[] = [];
  for (const path of files.sort()) {
    if (
      path === "" ||
      path === ".git" ||
      path.startsWith(`.git/`) ||
      isWatchExcluded(path, excludes)
    ) {
      continue;
    }
    const entry = fileEntry("watch path", watchPath, path, join(watchPath, path), true, readFile);
    if (isErr(entry)) return entry;
    entries.push(entry.value);
  }
  return ok(entries);
}

export function snapshotScope(
  worktreePath: string,
  watchPaths: readonly WatchPath[] = [],
  options: SnapshotOptions = {},
): Result<ScopeSnapshot, ScopeSnapshotRefusal> {
  const readFile: ScopeSnapshotFileReader =
    typeof options === "function" ? options : (options.readFile ?? ((path) => readFileSync(path)));
  const common = gitCommonDirectory(worktreePath);
  if (isErr(common)) return common;
  const mainRoot = dirname(common.value);
  const changed = changedMainPaths(mainRoot, worktreePath);
  if (isErr(changed)) return changed;

  const entries: ScopeSnapshotEntry[] = [];
  for (const path of changed.value) {
    const entry = fileEntry("main checkout", mainRoot, path, join(mainRoot, path), false, readFile);
    if (isErr(entry)) return entry;
    entries.push(entry.value);
  }

  const configured = new Map<string, readonly string[]>();
  for (const watchPath of watchPaths) {
    const path = typeof watchPath === "string" ? watchPath : watchPath.path;
    const excludes = typeof watchPath === "string" ? [] : watchPath.exclude;
    if (!isAbsolute(path)) return err({ path, because: "watch_paths entries must be absolute" });
    configured.set(resolve(path), excludes);
  }
  for (const [configuredPath, excludes] of [...configured.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const watched = watchEntries(configuredPath, excludes, readFile);
    if (isErr(watched)) return watched;
    entries.push(...watched.value);
  }

  return ok({ entries });
}

function entryKey(entry: ScopeSnapshotEntry): string {
  return `${entry.root}\0${entry.rootPath}\0${entry.path}`;
}

function sameEntry(a: ScopeSnapshotEntry | undefined, b: ScopeSnapshotEntry | undefined): boolean {
  return (
    a?.present === b?.present &&
    a?.size === b?.size &&
    a?.mtimeMs === b?.mtimeMs &&
    a?.sha256 === b?.sha256 &&
    a?.ownerOnly === b?.ownerOnly
  );
}

export function changedScopePaths(
  before: ScopeSnapshot,
  after: ScopeSnapshot,
): readonly ScopeGuardChange[] {
  const changes: ScopeGuardChange[] = [];
  const keys = new Set([...before.entries.map(entryKey), ...after.entries.map(entryKey)]);
  for (const key of [...keys].sort()) {
    const beforeEntry = before.entries.find((entry) => entryKey(entry) === key);
    const afterEntry = after.entries.find((entry) => entryKey(entry) === key);
    if (sameEntry(beforeEntry, afterEntry)) continue;
    const entry = afterEntry ?? beforeEntry;
    if (entry !== undefined) {
      changes.push({
        root: entry.root,
        rootPath: entry.rootPath,
        path: entry.path,
        ownerOnly: entry.ownerOnly,
      });
    }
  }
  return changes;
}

export function describeScopeChange(change: ScopeGuardChange): string {
  const description =
    change.root === "main checkout"
      ? `main checkout/${change.path}`
      : `watch path ${change.rootPath}/${change.path}`;
  return change.ownerOnly ? `${description} (owner-only; size and mtimeMs only)` : description;
}
