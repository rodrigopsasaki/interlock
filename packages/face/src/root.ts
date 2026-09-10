import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

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

export function journalDirectory(repoRoot: string): string {
  return join(repoRoot, ".interlock", "ledger");
}

export function currentCommitSha(repoRoot: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf-8",
  }).trim();
}
