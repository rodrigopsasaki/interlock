import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync, readdirSync, readFileSync, readlinkSync, type Stats } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface ManifestEntry {
  readonly kind: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly target?: string;
}

type Manifest = ReadonlyMap<string, ManifestEntry>;

export interface StateFolderCheckOptions {
  readonly accountHome: string;
  readonly repositoryRoot: string;
  readonly command: readonly string[];
  readonly journalFile?: string;
}

function stateDirectory(accountHome: string): string {
  return join(accountHome, ".local", "state", "interlock");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function manifestEntry(path: string, entry: Stats): ManifestEntry {
  if (entry.isSymbolicLink())
    return {
      kind: "symlink",
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      target: readlinkSync(path),
    };
  if (entry.isDirectory()) return { kind: "directory", size: entry.size, mtimeMs: entry.mtimeMs };
  if (entry.isFile()) return { kind: "file", size: entry.size, mtimeMs: entry.mtimeMs };
  return { kind: "other", size: entry.size, mtimeMs: entry.mtimeMs };
}

export function snapshotStateFolder(root: string): Manifest {
  const entries = new Map<string, ManifestEntry>();
  const visit = (directory: string): void => {
    let children: readonly string[];
    try {
      children = readdirSync(directory);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
      if (code === "ENOENT") return;
      throw new Error(`cannot read state folder ${directory}: ${code}`);
    }
    for (const name of children) {
      const path = join(directory, name);
      const entry = lstatSync(path);
      const key = relative(root, path);
      entries.set(key, manifestEntry(path, entry));
      if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
  return entries;
}

function journalPath(repositoryRoot: string): string {
  const commonDirectory = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  return join(
    dirname(resolve(repositoryRoot, commonDirectory)),
    ".interlock",
    "ledger",
    "journal.jsonl",
  );
}

function activeSessions(path: string): ReadonlySet<string> {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
    if (code === "ENOENT") return new Set();
    throw error;
  }
  const active = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(record)) continue;
    const event = record;
    const kind = event["kind"];
    if (kind === "session-started") {
      const session = event["session"];
      if (!isRecord(session)) continue;
      const sessionRecord = session;
      const node = sessionRecord["node"];
      if (!isRecord(node)) continue;
      const nodeRecord = node;
      if (typeof nodeRecord["graph"] !== "string" || typeof nodeRecord["id"] !== "string") continue;
      active.add(`${nodeRecord["graph"]}/${nodeRecord["id"]}`);
    }
    if (kind === "outcome-set") {
      const node = event["node"];
      if (!isRecord(node)) continue;
      const nodeRecord = node;
      if (typeof nodeRecord["graph"] === "string" && typeof nodeRecord["id"] === "string") {
        active.delete(`${nodeRecord["graph"]}/${nodeRecord["id"]}`);
      }
    }
  }
  return active;
}

function exempt(path: string, root: string, sessions: ReadonlySet<string>): boolean {
  const parts = relative(root, path).split(/[\\/]/);
  if (parts[0] !== "codex-homes") return false;
  return [...sessions].some((session) => {
    const sessionParts = session.split("/");
    return parts.every(
      (part, index) =>
        index === 0 || index > sessionParts.length || sessionParts[index - 1] === part,
    );
  });
}

function sameEntry(left: ManifestEntry | undefined, right: ManifestEntry | undefined): boolean {
  return (
    left?.kind === right?.kind &&
    left?.size === right?.size &&
    left?.mtimeMs === right?.mtimeMs &&
    left?.target === right?.target
  );
}

function changes(
  before: Manifest,
  after: Manifest,
  root: string,
  sessions: ReadonlySet<string>,
): readonly string[] {
  const names = new Set([...before.keys(), ...after.keys()]);
  return [...names]
    .filter((name) => !exempt(join(root, name), root, sessions))
    .filter((name) => !sameEntry(before.get(name), after.get(name)))
    .sort();
}

export function runStateFolderCheck(options: StateFolderCheckOptions): number {
  const root = stateDirectory(options.accountHome);
  const before = snapshotStateFolder(root);
  const command = options.command[0];
  if (command === undefined) {
    console.error("state-folder-untouched: missing command");
    return 2;
  }
  const result = spawnSync(command, options.command.slice(1), {
    stdio: "inherit",
    cwd: options.repositoryRoot,
  });
  const after = snapshotStateFolder(root);
  const changed = changes(
    before,
    after,
    root,
    activeSessions(options.journalFile ?? journalPath(options.repositoryRoot)),
  );
  if (changed.length > 0) {
    for (const name of changed) console.error(`interlock state changed: ${name}`);
    return 1;
  }
  if (result.error !== undefined) {
    console.error(`command failed to start: ${result.error.message}`);
    return 2;
  }
  if (result.status !== 0) return result.status ?? 2;
  console.log("interlock state folder untouched");
  return 0;
}

function main(): number {
  return runStateFolderCheck({
    accountHome: userInfo().homedir,
    repositoryRoot: process.cwd(),
    command: process.argv.slice(2),
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = main();
