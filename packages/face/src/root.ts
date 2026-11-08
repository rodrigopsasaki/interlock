import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const TEST_FORBIDDEN_ROOT = "INTERLOCK_TEST_FORBIDDEN_ROOT";

function isWithin(path: string, root: string): boolean {
  const pathFromRoot = relative(resolve(root), resolve(path));
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot))
  );
}

function linkedWorktreeGitDirectory(repoRoot: string): string | undefined {
  try {
    const gitFile = readFileSync(join(repoRoot, ".git"), "utf-8").trim();
    const prefix = "gitdir: ";
    if (!gitFile.startsWith(prefix)) return undefined;
    return resolve(repoRoot, gitFile.slice(prefix.length));
  } catch {
    return undefined;
  }
}

function isForbiddenRepository(reachedPath: string, forbiddenRoot: string): boolean {
  const resolvedForbiddenRoot = resolve(forbiddenRoot);
  if (resolve(reachedPath) === resolvedForbiddenRoot) return true;
  if (isWithin(reachedPath, join(resolvedForbiddenRoot, ".interlock"))) return true;
  const gitDirectory = linkedWorktreeGitDirectory(reachedPath);
  return (
    gitDirectory !== undefined &&
    isWithin(gitDirectory, join(resolvedForbiddenRoot, ".git", "worktrees"))
  );
}

function refuseForbiddenRepository(startDirectory: string, reachedPath: string): void {
  const forbiddenRoot = process.env[TEST_FORBIDDEN_ROOT];
  if (forbiddenRoot === undefined || !isForbiddenRepository(reachedPath, forbiddenRoot)) return;
  throw new Error(
    `test cwd "${startDirectory}" reached forbidden repository path "${reachedPath}"`,
  );
}

export function findRepoRoot(startDirectory: string): string | undefined {
  let current = startDirectory;
  while (true) {
    if (existsSync(join(current, ".interlock"))) {
      refuseForbiddenRepository(startDirectory, current);
      return current;
    }
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
  const journalDirectory = join(dirname(resolve(repoRoot, commonDir)), ".interlock", "ledger");
  refuseForbiddenRepository(repoRoot, journalDirectory);
  return journalDirectory;
}

export function currentCommitSha(repoRoot: string): Promise<string> {
  return gitOutput(repoRoot, ["rev-parse", "HEAD"]);
}
