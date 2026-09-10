import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function findRepoRoot(startDirectory: string): string | undefined {
  let current = startDirectory;
  while (true) {
    if (existsSync(join(current, ".interlock"))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function graphFilePath(repoRoot: string, graphId: string): string {
  return join(repoRoot, ".interlock", "graphs", `${graphId}.yaml`);
}

// The journal belongs to the repository, not the worktree: every worktree of one repository
// shares the git dir common to all of them, so resolving the journal under its parent means
// every worktree reads and writes the same journal.
export function journalDirectory(repoRoot: string): string {
  const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
  return join(dirname(resolve(repoRoot, commonDir)), ".interlock", "ledger");
}

export function currentCommitSha(repoRoot: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
}
