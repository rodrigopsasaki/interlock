import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";

export type WorktreeRefusal =
  | {
      readonly kind: "git-failed";
      readonly command: readonly string[];
      readonly because: string;
    }
  | {
      readonly kind: "diverged";
      readonly branch: string;
      readonly commit: string;
    };

export function explainWorktreeRefusal(refusal: WorktreeRefusal): string {
  switch (refusal.kind) {
    case "git-failed":
      return `git ${refusal.command.join(" ")}: ${refusal.because}`;
    case "diverged":
      return `branch "${refusal.branch}" carries commits beyond its base at ${refusal.commit}; refusing to discard them.`;
  }
}

interface ExecError extends Error {
  readonly status: number | null;
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && "status" in error;
}

function git(
  cwd: string,
  args: readonly string[],
): Result<string, WorktreeRefusal> {
  try {
    return ok(execFileSync("git", [...args], { cwd, encoding: "utf-8" }));
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

// git exits 1 (no stderr) for "not an ancestor", the ordinary negative answer, and nonzero with
// a message for a real failure (bad revision, corrupt object, ...); only the latter is a refusal.
function isAncestor(
  repoRoot: string,
  ancestor: string,
  descendant: string,
): Result<boolean, WorktreeRefusal> {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  try {
    execFileSync("git", args, { cwd: repoRoot, encoding: "utf-8" });
    return ok(true);
  } catch (error) {
    if (isExecError(error) && error.status === 1) return ok(false);
    return err({
      kind: "git-failed",
      command: args,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

// The worktree at `path` already exists from an earlier run. Moving it to a new base is safe
// only when the branch has nothing of its own: every commit it carries must already be reachable
// from `sha`. Otherwise a session's work would be discarded silently.
function reuseWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
): Result<string, WorktreeRefusal> {
  const tip = git(repoRoot, ["rev-parse", branch]);
  if (isErr(tip)) return tip;
  const tipSha = tip.value.trim();
  if (tipSha === sha) return ok(path);

  const safe = isAncestor(repoRoot, tipSha, sha);
  if (isErr(safe)) return safe;
  if (!safe.value) return err({ kind: "diverged", branch, commit: tipSha });

  const reset = git(path, ["reset", "--hard", sha]);
  return isOk(reset) ? ok(path) : reset;
}

export function ensureNodeWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
): Result<string, WorktreeRefusal> {
  if (existsSync(join(path, ".git"))) {
    return reuseWorktree(repoRoot, path, sha, branch);
  }
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
