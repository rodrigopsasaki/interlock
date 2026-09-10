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
    }
  | {
      readonly kind: "dirty-behind-base";
      readonly branch: string;
      readonly paths: number;
    };

export function explainWorktreeRefusal(refusal: WorktreeRefusal): string {
  switch (refusal.kind) {
    case "git-failed":
      return `git ${refusal.command.join(" ")}: ${refusal.because}`;
    case "diverged":
      return `branch "${refusal.branch}" carries commits beyond its base at ${refusal.commit}; refusing to discard them.`;
    case "dirty-behind-base":
      return `branch "${refusal.branch}" is behind its base with ${refusal.paths} uncommitted path(s); refusing to reset over them.`;
  }
}

export type WorktreeOutcome =
  | { readonly kind: "created"; readonly path: string }
  | {
      readonly kind: "reused";
      readonly path: string;
      readonly uncommittedPaths: number;
      readonly commitsBeyondBase: number;
    };

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

// git exits 1 for "not an ancestor"; only a nonzero exit with a message is a real failure.
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

function commitsBeyondBase(
  repoRoot: string,
  base: string,
  tip: string,
): Result<number, WorktreeRefusal> {
  const counted = git(repoRoot, ["rev-list", "--count", `${base}..${tip}`]);
  if (isErr(counted)) return counted;
  return ok(Number.parseInt(counted.value.trim(), 10));
}

function parsePorcelainPath(line: string): string {
  const path = line.slice(3);
  const arrow = path.indexOf(" -> ");
  return arrow === -1 ? path : path.slice(arrow + 4);
}

export function uncommittedPaths(
  worktreePath: string,
): Result<readonly string[], WorktreeRefusal> {
  const status = git(worktreePath, [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (isErr(status)) return status;
  const paths = status.value
    .split("\n")
    .filter((line) => line.length > 0)
    .map(parsePorcelainPath);
  return ok(paths);
}

function reused(
  path: string,
  uncommittedPathCount: number,
  commitsBeyondBaseCount: number,
): WorktreeOutcome {
  return {
    kind: "reused",
    path,
    uncommittedPaths: uncommittedPathCount,
    commitsBeyondBase: commitsBeyondBaseCount,
  };
}

function reuseWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
): Result<WorktreeOutcome, WorktreeRefusal> {
  const tip = git(repoRoot, ["rev-parse", branch]);
  if (isErr(tip)) return tip;
  const tipSha = tip.value.trim();

  const dirty = uncommittedPaths(path);
  if (isErr(dirty)) return dirty;
  const dirtyCount = dirty.value.length;

  if (tipSha === sha) return ok(reused(path, dirtyCount, 0));

  const tipBehindBase = isAncestor(repoRoot, tipSha, sha);
  if (isErr(tipBehindBase)) return tipBehindBase;

  if (!tipBehindBase.value) {
    const baseBehindTip = isAncestor(repoRoot, sha, tipSha);
    if (isErr(baseBehindTip)) return baseBehindTip;
    if (!baseBehindTip.value) {
      return err({ kind: "diverged", branch, commit: tipSha });
    }
    const ahead = commitsBeyondBase(repoRoot, sha, tipSha);
    if (isErr(ahead)) return ahead;
    return ok(reused(path, dirtyCount, ahead.value));
  }

  if (dirtyCount > 0) {
    return err({ kind: "dirty-behind-base", branch, paths: dirtyCount });
  }
  const reset = git(path, ["reset", "--hard", sha]);
  return isOk(reset) ? ok(reused(path, 0, 0)) : reset;
}

export function ensureNodeWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
): Result<WorktreeOutcome, WorktreeRefusal> {
  if (existsSync(join(path, ".git"))) {
    return reuseWorktree(repoRoot, path, sha, branch);
  }
  const args = branchExists(repoRoot, branch)
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, sha];
  const added = git(repoRoot, args);
  return isOk(added) ? ok({ kind: "created", path }) : added;
}

const BRIEF_COMMIT_FOOTER =
  "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>";

export function commitBriefIfChanged(
  worktreePath: string,
  briefRelativePath: string,
  node: string,
  session: string,
): Result<string | undefined, WorktreeRefusal> {
  const dirty = uncommittedPaths(worktreePath);
  if (isErr(dirty)) return dirty;
  if (!dirty.value.includes(briefRelativePath)) return ok(undefined);

  const staged = git(worktreePath, ["add", "--", briefRelativePath]);
  if (isErr(staged)) return staged;

  const message = [
    `chore(${node}): write the session brief`,
    "",
    `Writes the session brief ${node} starts session ${session} from.`,
    "",
    BRIEF_COMMIT_FOOTER,
  ].join("\n");
  const committed = git(worktreePath, [
    "commit",
    "-m",
    message,
    "--",
    briefRelativePath,
  ]);
  if (isErr(committed)) return committed;

  const short = git(worktreePath, ["rev-parse", "--short", "HEAD"]);
  return isOk(short) ? ok(short.value.trim()) : short;
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
