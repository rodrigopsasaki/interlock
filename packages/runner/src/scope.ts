import { execFileSync } from "node:child_process";
import { type ScopeEntry, scopeEntry } from "ledger";

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;
const GITLINK_MODE = "160000";
const INDEX_RECORD = /^(\d{6}) ([0-9a-f]+) (\d)\t(.*)$/s;

function parseIndexRecord(record: string): ScopeEntry | undefined {
  const parsed = INDEX_RECORD.exec(record);
  if (parsed === null) return undefined;
  const [, mode, objectId, , path] = parsed;
  if (mode === undefined || objectId === undefined || path === undefined) return undefined;
  return mode === GITLINK_MODE ? scopeEntry.gitlink(path, objectId) : scopeEntry.file(path);
}

export function scopeFromIndex(root: string, index: string): readonly ScopeEntry[] {
  const seen = new Set<string>();
  const entries: ScopeEntry[] = [];
  for (const record of index.split("\0")) {
    if (record === "") continue;
    const entry = parseIndexRecord(record);
    if (entry === undefined)
      throw new Error(
        `${root}: git ls-files -s printed an index record interlock cannot read, so the scope is refused rather than read without it: ${JSON.stringify(record)}`,
      );
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    entries.push(entry);
  }
  return entries;
}

export function gitScope(root: string): readonly ScopeEntry[] {
  return scopeFromIndex(
    root,
    execFileSync("git", ["ls-files", "-s", "-z"], {
      cwd: root,
      encoding: "utf-8",
      maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
    }),
  );
}

export function gitTrackedFiles(root: string): readonly string[] {
  return gitScope(root).map((entry) => entry.path);
}
