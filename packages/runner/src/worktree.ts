import { execFileSync } from "node:child_process";
import { err, isOk, ok, type Result } from "@phyxiusjs/fp";

export interface WorktreeRefusal {
  readonly kind: "git-failed";
  readonly command: readonly string[];
  readonly because: string;
}

export function explainWorktreeRefusal(refusal: WorktreeRefusal): string {
  return `git ${refusal.command.join(" ")}: ${refusal.because}`;
}

function git(
  repoRoot: string,
  args: readonly string[],
): Result<string, WorktreeRefusal> {
  try {
    return ok(
      execFileSync("git", [...args], { cwd: repoRoot, encoding: "utf-8" }),
    );
  } catch (error) {
    return err({
      kind: "git-failed",
      command: args,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function branchExists(repoRoot: string, branch: string): boolean {
  const found = git(repoRoot, [
    "show-ref",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]);
  return isOk(found);
}

export function ensureNodeWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
): Result<string, WorktreeRefusal> {
  const args = branchExists(repoRoot, branch)
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, sha];
  const added = git(repoRoot, args);
  return isOk(added) ? ok(path) : added;
}

export function createDetachedWorktree(
  repoRoot: string,
  path: string,
  sha: string,
): Result<string, WorktreeRefusal> {
  const added = git(repoRoot, ["worktree", "add", "--detach", path, sha]);
  return isOk(added) ? ok(path) : added;
}

export function removeWorktree(
  repoRoot: string,
  path: string,
): Result<void, WorktreeRefusal> {
  const removed = git(repoRoot, ["worktree", "remove", "--force", path]);
  return isOk(removed) ? ok(undefined) : removed;
}
