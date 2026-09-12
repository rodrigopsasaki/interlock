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
      readonly kind: "dirty-behind-base";
      readonly branch: string;
      readonly paths: number;
    };

export function explainWorktreeRefusal(refusal: WorktreeRefusal): string {
  switch (refusal.kind) {
    case "git-failed":
      return `git ${refusal.command.join(" ")}: ${refusal.because}`;
    case "dirty-behind-base":
      return `branch "${refusal.branch}" is behind its base with ${refusal.paths} uncommitted path(s); refusing to reset over them.`;
  }
}

export type WorktreeOutcome =
  | { readonly kind: "created"; readonly path: string; readonly base: string }
  | {
      readonly kind: "reused";
      readonly path: string;
      readonly base: string;
      readonly uncommittedPaths: number;
      readonly commitsBeyondBase: number;
    };

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

function mergeBase(
  repoRoot: string,
  a: string,
  b: string,
): Result<string, WorktreeRefusal> {
  const found = git(repoRoot, ["merge-base", a, b]);
  if (isErr(found)) return found;
  return ok(found.value.trim());
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
  base: string,
  uncommittedPathCount: number,
  commitsBeyondBaseCount: number,
): WorktreeOutcome {
  return {
    kind: "reused",
    path,
    base,
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

  if (tipSha === sha) return ok(reused(path, sha, dirtyCount, 0));

  const base = mergeBase(repoRoot, sha, tipSha);
  if (isErr(base)) return base;

  if (base.value === tipSha) {
    if (dirtyCount > 0) {
      return err({ kind: "dirty-behind-base", branch, paths: dirtyCount });
    }
    const reset = git(path, ["reset", "--hard", sha]);
    return isOk(reset) ? ok(reused(path, sha, 0, 0)) : reset;
  }

  const ahead = commitsBeyondBase(repoRoot, base.value, tipSha);
  if (isErr(ahead)) return ahead;
  return ok(reused(path, base.value, dirtyCount, ahead.value));
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
  return isOk(added) ? ok({ kind: "created", path, base: sha }) : added;
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
    `chore: write the session brief for ${node}`,
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
