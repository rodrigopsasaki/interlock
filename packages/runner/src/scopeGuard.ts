import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;
const EXCLUDED_ROOTS: readonly string[] = [".interlock/ledger", ".interlock/sessions"];

export interface ScopeSnapshotEntry {
  readonly root: "main checkout" | "watch path";
  readonly rootPath: string;
  readonly path: string;
  readonly present: boolean;
  readonly size: number | undefined;
  readonly sha256: string | undefined;
}

export interface ScopeSnapshot {
  readonly entries: readonly ScopeSnapshotEntry[];
}

export interface ScopeGuardChange {
  readonly root: ScopeSnapshotEntry["root"];
  readonly rootPath: string;
  readonly path: string;
}

export interface ScopeSnapshotRefusal {
  readonly path: string;
  readonly because: string;
}

function gitCommonDirectory(worktreePath: string): Result<string, ScopeSnapshotRefusal> {
  try {
    const common = execFileSync(
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

function isExcluded(path: string): boolean {
  return EXCLUDED_ROOTS.some((excluded) => path === excluded || path.startsWith(`${excluded}/`));
}

function changedMainPaths(mainRoot: string): Result<readonly string[], ScopeSnapshotRefusal> {
  try {
    const status = execFileSync(
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
      if (!isExcluded(path)) paths.add(path);
      if (record.slice(0, 2).includes("R") || record.slice(0, 2).includes("C")) {
        const source = records[index + 1];
        index += 1;
        if (source !== undefined && !isExcluded(source)) paths.add(source);
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
): Result<ScopeSnapshotEntry, ScopeSnapshotRefusal> {
  try {
    const stat = statSync(absolutePath);
    if (!stat.isFile()) {
      return err({ path: absolutePath, because: "the snapshot target is not a regular file" });
    }
    const content = readFileSync(absolutePath);
    return ok({
      root,
      rootPath,
      path,
      present: true,
      size: stat.size,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return ok({ root, rootPath, path, present: false, size: undefined, sha256: undefined });
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
): Result<void, ScopeSnapshotRefusal> {
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
      const collected = collectWatchFiles(rootPath, next, files);
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

function watchEntries(
  watchPath: string,
): Result<readonly ScopeSnapshotEntry[], ScopeSnapshotRefusal> {
  const files: string[] = [];
  const collected = collectWatchFiles(watchPath, watchPath, files);
  if (isErr(collected)) return collected;
  const entries: ScopeSnapshotEntry[] = [];
  for (const path of files.sort()) {
    if (path === "" || path === ".git" || path.startsWith(`.git/`) || isExcluded(path)) continue;
    const entry = fileEntry("watch path", watchPath, path, join(watchPath, path));
    if (isErr(entry)) return entry;
    entries.push(entry.value);
  }
  return ok(entries);
}

export function snapshotScope(
  worktreePath: string,
  watchPaths: readonly string[] = [],
): Result<ScopeSnapshot, ScopeSnapshotRefusal> {
  const common = gitCommonDirectory(worktreePath);
  if (isErr(common)) return common;
  const mainRoot = dirname(common.value);
  const changed = changedMainPaths(mainRoot);
  if (isErr(changed)) return changed;

  const entries: ScopeSnapshotEntry[] = [];
  for (const path of changed.value) {
    const entry = fileEntry("main checkout", mainRoot, path, join(mainRoot, path));
    if (isErr(entry)) return entry;
    entries.push(entry.value);
  }

  for (const configuredPath of [...new Set(watchPaths)].sort()) {
    if (!isAbsolute(configuredPath)) {
      return err({ path: configuredPath, because: "watch_paths entries must be absolute" });
    }
    const watched = watchEntries(resolve(configuredPath));
    if (isErr(watched)) return watched;
    entries.push(...watched.value);
  }

  return ok({ entries });
}

function entryKey(entry: ScopeSnapshotEntry): string {
  return `${entry.root}\0${entry.rootPath}\0${entry.path}`;
}

function sameEntry(a: ScopeSnapshotEntry | undefined, b: ScopeSnapshotEntry | undefined): boolean {
  return a?.present === b?.present && a?.size === b?.size && a?.sha256 === b?.sha256;
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
      changes.push({ root: entry.root, rootPath: entry.rootPath, path: entry.path });
    }
  }
  return changes;
}

export function describeScopeChange(change: ScopeGuardChange): string {
  return change.root === "main checkout"
    ? `main checkout/${change.path}`
    : `watch path ${change.rootPath}/${change.path}`;
}
