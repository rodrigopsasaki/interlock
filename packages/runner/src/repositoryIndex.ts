import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { interlockStateDirectory } from "./codex/config.ts";
import { execFileSyncOwned } from "./ownedCommand.ts";

export const REPOSITORY_INDEX_SHAPE = "repository-index@v0";

export interface RepositoryIndexEntry {
  readonly interlock: typeof REPOSITORY_INDEX_SHAPE;
  readonly commonGitDir: string;
  readonly repository: string;
  readonly runRoot: string;
}

export interface RepositoryIndexRead {
  readonly entries: readonly RepositoryIndexEntry[];
  readonly errors: readonly string[];
}

function environmentOf(
  environment?: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const source = environment ?? process.env;
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

export function repositoryIndexPath(
  environment?: Readonly<Record<string, string | undefined>>,
): string {
  return join(interlockStateDirectory(environmentOf(environment)), "repositories");
}

function canonicalPath(path: string): string {
  return realpathSync(path);
}

function commonGitDirectory(cwd: string): string | undefined {
  try {
    return canonicalPath(
      execFileSyncOwned("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return undefined;
  }
}

function repositoryRoot(cwd: string): string {
  try {
    const worktrees = execFileSyncOwned("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const first = worktrees.split(/\r?\n/).find((line) => line.startsWith("worktree "));
    if (first !== undefined) return canonicalPath(first.slice("worktree ".length));
  } catch {}
  try {
    return canonicalPath(
      execFileSyncOwned("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim(),
    );
  } catch {
    return canonicalPath(cwd);
  }
}

function entryPath(indexPath: string, commonGitDir: string): string {
  const digest = createHash("sha256").update(commonGitDir).digest("hex");
  return join(indexPath, `${digest}.json`);
}

export function registerRepository(
  cwd: string,
  runRoot: string,
  environment?: Readonly<Record<string, string | undefined>>,
): void {
  const commonGitDir = commonGitDirectory(cwd);
  if (commonGitDir === undefined) return;
  const indexPath = repositoryIndexPath(environment);
  try {
    mkdirSync(indexPath, { recursive: true, mode: 0o700 });
  } catch {
    return;
  }
  const entry: RepositoryIndexEntry = {
    interlock: REPOSITORY_INDEX_SHAPE,
    commonGitDir,
    repository: repositoryRoot(cwd),
    runRoot: resolve(runRoot),
  };
  const destination = entryPath(indexPath, commonGitDir);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(entry)}\n`, { encoding: "utf-8", mode: 0o600 });
    renameSync(temporary, destination);
  } catch {
    return;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(
  record: Record<string, unknown>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}

function parseEntry(value: unknown): RepositoryIndexEntry | undefined {
  if (!isRecord(value)) return undefined;
  const commonGitDir = stringValue(value, "commonGitDir", "common_git_dir");
  const repository = stringValue(value, "repository", "root");
  const runRoot = stringValue(value, "runRoot", "run_root");
  if (commonGitDir === undefined || repository === undefined || runRoot === undefined)
    return undefined;
  return {
    interlock: REPOSITORY_INDEX_SHAPE,
    commonGitDir,
    repository,
    runRoot,
  };
}

function parseText(
  text: string,
  path: string,
): { entries: RepositoryIndexEntry[]; errors: string[] } {
  const entries: RepositoryIndexEntry[] = [];
  const errors: string[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      const entry = parseEntry(parsed);
      if (entry === undefined) errors.push(`${path}: entry ${String(index + 1)} is malformed`);
      else entries.push(entry);
    } catch {
      errors.push(`${path}: entry ${String(index + 1)} is not valid JSON`);
    }
  }
  return { entries, errors };
}

export function readRepositoryIndex(
  environment?: Readonly<Record<string, string | undefined>>,
): RepositoryIndexRead {
  const indexPath = repositoryIndexPath(environment);
  if (!existsSync(indexPath)) return { entries: [], errors: [] };
  try {
    const stat = lstatSync(indexPath);
    if (!stat.isDirectory()) return parseText(readFileSync(indexPath, "utf-8"), indexPath);
    const entries: RepositoryIndexEntry[] = [];
    const errors: string[] = [];
    for (const name of readdirSync(indexPath).sort()) {
      if (!name.endsWith(".json")) continue;
      const path = join(indexPath, name);
      try {
        const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
        const entry = parseEntry(parsed);
        if (entry === undefined) errors.push(`${path}: entry is malformed`);
        else entries.push(entry);
      } catch {
        errors.push(`${path}: entry is unreadable`);
      }
    }
    return { entries, errors };
  } catch {
    return { entries: [], errors: [`${indexPath}: index is unreadable`] };
  }
}
