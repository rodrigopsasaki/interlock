import { execFile } from "node:child_process";
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

function gitOutput(repoRoot: string, args: readonly string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile("git", args, { cwd: repoRoot, encoding: "utf-8" }, (error, stdout) => {
      if (error === null) resolvePromise(stdout.trim());
      else reject(error);
    });
  });
}

export async function sharedJournalDirectory(repoRoot: string): Promise<string> {
  const commonDir = await gitOutput(repoRoot, ["rev-parse", "--git-common-dir"]);
  return join(dirname(resolve(repoRoot, commonDir)), ".interlock", "ledger");
}

export function currentCommitSha(repoRoot: string): Promise<string> {
  return gitOutput(repoRoot, ["rev-parse", "HEAD"]);
}
