import { existsSync } from "node:fs";
import { join } from "node:path";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { execFileSyncOwned } from "./ownedCommand.ts";

export type WorktreeRefusal =
  | {
      readonly kind: "git-failed";
      readonly command: readonly string[];
      readonly because: string;
    }
  | {
      readonly kind: "main-branch-missing";
      readonly because: string;
    }
  | {
      readonly kind: "dirty-behind-base";
      readonly branch: string;
      readonly paths: number;
    }
  | {
      readonly kind: "stale-base";
      readonly branch: string;
      readonly base: string;
      readonly mainBranch: string;
      readonly main: string;
      readonly mainCommits: number;
      readonly mainTouchesOutsideInterlock: boolean;
      readonly commitsBeyondBase: number;
    }
  | {
      readonly kind: "base-predates-graph";
      readonly base: string;
      readonly graph: string;
      readonly node: string;
    };

export function explainWorktreeRefusal(refusal: WorktreeRefusal): string {
  switch (refusal.kind) {
    case "git-failed":
      return `git ${refusal.command.join(" ")}: ${refusal.because}`;
    case "main-branch-missing":
      return refusal.because;
    case "dirty-behind-base":
      return `branch "${refusal.branch}" is behind its base with ${refusal.paths} uncommitted path(s); refusing to reset over them.`;
    case "stale-base":
      return (
        `stale base: branch "${refusal.branch}" is based at ${refusal.base} and has ` +
        `${refusal.commitsBeyondBase} commit(s) beyond that base, but ${refusal.mainBranch} ` +
        `moved to sampled ${refusal.main} with ${refusal.mainCommits} commit(s) gained since ` +
        `the base; changes outside .interlock/: ${refusal.mainTouchesOutsideInterlock ? "yes" : "no"}. ` +
        "Refusing before lease. A person must inspect the branch, then either relaunch on a " +
        "fresh worktree after keeping the branch under an attempt ref, or merge main by hand as a signed commit."
      );
    case "base-predates-graph":
      return `this worktree's base (${refusal.base.slice(0, 7)}) predates graph ${refusal.graph}; merge main into graph/${refusal.graph}/${refusal.node} and run again`;
  }
}

export type WorktreeOutcome =
  | {
      readonly kind: "created";
      readonly path: string;
      readonly base: string;
      readonly uncommittedPaths?: number;
      readonly commitsBeyondBase?: number;
    }
  | {
      readonly kind: "reused";
      readonly path: string;
      readonly base: string;
      readonly uncommittedPaths: number;
      readonly commitsBeyondBase: number;
    };

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;

export interface MainBranch {
  readonly branch: string;
  readonly sha: string;
}

interface MainChanges {
  readonly commits: number;
  readonly touchesOutsideInterlock: boolean;
}

function git(cwd: string, args: readonly string[]): Result<string, WorktreeRefusal> {
  try {
    return ok(
      execFileSyncOwned("git", [...args], {
        cwd,
        encoding: "utf-8",
        maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
      }),
    );
  } catch (error) {
    return err({
      kind: "git-failed",
      command: args,
      because: error instanceof Error ? error.message : String(error),
    });
  }
}

function gitPathExistsAtCommit(repoRoot: string, path: string): boolean {
  try {
    execFileSyncOwned("git", ["cat-file", "-e", path], {
      cwd: repoRoot,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

function branchExists(repoRoot: string, branch: string): boolean {
  const found = git(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return isOk(found);
}

function mergeBase(repoRoot: string, a: string, b: string): Result<string, WorktreeRefusal> {
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

function changedPaths(
  repoRoot: string,
  base: string,
  main: string,
): Result<readonly string[], WorktreeRefusal> {
  const changed = git(repoRoot, ["diff", "--name-only", "--no-renames", base, main]);
  if (isErr(changed)) return changed;
  return ok(changed.value.split("\n").filter((path) => path.length > 0));
}

export function mainChangesSince(
  repoRoot: string,
  base: string,
  main: string,
): Result<MainChanges, WorktreeRefusal> {
  const commits = commitsBeyondBase(repoRoot, base, main);
  if (isErr(commits)) return commits;
  const paths = changedPaths(repoRoot, base, main);
  if (isErr(paths)) return paths;
  return ok({
    commits: commits.value,
    touchesOutsideInterlock: paths.value.some(
      (path) => path !== ".interlock" && !path.startsWith(".interlock/"),
    ),
  });
}

export function mainBranchOf(repoRoot: string): Result<MainBranch, WorktreeRefusal> {
  const originHead = git(repoRoot, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const originBranch = isOk(originHead)
    ? originHead.value.trim().replace(/^origin\//, "")
    : undefined;
  const candidates = [originBranch, "main", "master"].filter(
    (branch): branch is string => branch !== undefined && branch.length > 0,
  );
  for (const branch of candidates) {
    const resolved = git(repoRoot, ["rev-parse", "--verify", `refs/heads/${branch}`]);
    if (isOk(resolved)) return ok({ branch, sha: resolved.value.trim() });
  }
  return err({
    kind: "main-branch-missing",
    because: "no main branch ref: expected origin's default branch, main, or master",
  });
}

export function uncommittedPaths(
  worktreePath: string,
  includeRenameSources = false,
): Result<readonly string[], WorktreeRefusal> {
  const status = git(worktreePath, ["status", "--porcelain", "-z", "--untracked-files=all"]);
  if (isErr(status)) return status;
  const records = status.value.split("\0");
  const paths = new Set<string>();
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length === 0) continue;
    paths.add(record.slice(3));
    if (record.slice(0, 2).includes("R") || record.slice(0, 2).includes("C")) {
      const source = records[++index];
      if (includeRenameSources && source !== undefined) paths.add(source);
    }
  }
  return ok([...paths]);
}

export function worktreeHead(worktree: string): Result<string, WorktreeRefusal> {
  const head = git(worktree, ["rev-parse", "HEAD"]);
  return isErr(head) ? head : ok(head.value.trim());
}

export function baseHoldsGraph(
  repoRoot: string,
  base: string,
  graph: string,
  node: string,
): Result<void, WorktreeRefusal> {
  const graphPath = `${base}:.interlock/graphs/${graph}.yaml`;
  return gitPathExistsAtCommit(repoRoot, graphPath)
    ? ok(undefined)
    : err({ kind: "base-predates-graph", base, graph, node });
}

export function resetCommits(worktree: string, head: string): Result<string, WorktreeRefusal> {
  return git(worktree, ["reset", "--mixed", head]);
}

export function commitPaths(
  worktree: string,
  paths: readonly string[],
  message: string,
  trailers: readonly string[],
): Result<string, WorktreeRefusal> {
  if (paths.length === 0) return worktreeHead(worktree);
  const reset = git(worktree, ["--literal-pathspecs", "reset", "--quiet", "HEAD", "--", ...paths]);
  if (isErr(reset)) return reset;
  const staged = git(worktree, ["--literal-pathspecs", "add", "--", ...paths]);
  if (isErr(staged)) return staged;
  const committed = git(worktree, [
    "--literal-pathspecs",
    "-c",
    "maintenance.auto=false",
    "commit",
    "-S",
    "--only",
    "-m",
    [message, "", ...trailers].join("\n"),
    "--",
    ...paths,
  ]);
  return isErr(committed) ? committed : worktreeHead(worktree);
}

export function isIgnoredPath(worktree: string, path: string): boolean {
  return isOk(git(worktree, ["check-ignore", "--quiet", "--", path]));
}

export function isCommittedAtHead(worktreePath: string, relativePath: string): boolean {
  try {
    execFileSyncOwned("git", ["cat-file", "-e", `HEAD:${relativePath}`], {
      cwd: worktreePath,
      stdio: ["ignore", "ignore", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
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
  mainBranch: string,
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
  const mainChanges = mainChangesSince(repoRoot, base.value, sha);
  if (isErr(mainChanges)) return mainChanges;
  if (
    ahead.value > 0 &&
    mainChanges.value.commits > 0 &&
    mainChanges.value.touchesOutsideInterlock
  ) {
    return err({
      kind: "stale-base",
      branch,
      base: base.value,
      mainBranch,
      main: sha,
      mainCommits: mainChanges.value.commits,
      mainTouchesOutsideInterlock: true,
      commitsBeyondBase: ahead.value,
    });
  }
  return ok(reused(path, base.value, dirtyCount, ahead.value));
}

export function ensureNodeWorktree(
  repoRoot: string,
  path: string,
  sha: string,
  branch: string,
  mainBranch = "main",
): Result<WorktreeOutcome, WorktreeRefusal> {
  if (existsSync(join(path, ".git"))) {
    return reuseWorktree(repoRoot, path, sha, branch, mainBranch);
  }
  const existingBranch = branchExists(repoRoot, branch);
  const args = existingBranch
    ? ["worktree", "add", path, branch]
    : ["worktree", "add", "-b", branch, path, sha];
  const added = git(repoRoot, args);
  if (isErr(added)) return added;
  if (!existingBranch) return ok({ kind: "created", path, base: sha });
  const reattached = reuseWorktree(repoRoot, path, sha, branch, mainBranch);
  if (isErr(reattached)) return reattached;
  if (reattached.value.kind !== "reused") return ok(reattached.value);
  return ok({
    kind: "created",
    path,
    base: reattached.value.base,
    uncommittedPaths: reattached.value.uncommittedPaths,
    commitsBeyondBase: reattached.value.commitsBeyondBase,
  });
}

const BRIEF_COMMIT_FOOTER = "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>";
const BRIEF_COMMIT_HEADER = "chore: write the session brief for ";
const COMMIT_LINE_LIMIT = 100;
const TRUNCATION_MARK = "...";

function briefCommitHeader(node: string): string {
  const room = COMMIT_LINE_LIMIT - BRIEF_COMMIT_HEADER.length;
  const fitting =
    node.length <= room
      ? node
      : `${node.slice(0, room - TRUNCATION_MARK.length)}${TRUNCATION_MARK}`;
  return `${BRIEF_COMMIT_HEADER}${fitting}`;
}

function labelledLines(label: string, value: string): readonly string[] {
  const text = `${label}${value}`;
  const lines: string[] = [];
  for (let start = 0; start < text.length; start += COMMIT_LINE_LIMIT) {
    lines.push(text.slice(start, start + COMMIT_LINE_LIMIT));
  }
  return lines;
}

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
    briefCommitHeader(node),
    "",
    "Writes the session brief this node starts its session from.",
    "",
    ...labelledLines("Node: ", node),
    ...labelledLines("Session: ", session),
    "",
    BRIEF_COMMIT_FOOTER,
  ].join("\n");
  const committed = git(worktreePath, [
    "-c",
    "maintenance.auto=false",
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

export type WorktreeGitLayout =
  | { readonly kind: "linked"; readonly commonGitDir: string; readonly gitDir: string }
  | { readonly kind: "not-linked" };

function absoluteGitPath(worktreePath: string, flag: string): Result<string, WorktreeRefusal> {
  const resolved = git(worktreePath, ["rev-parse", "--path-format=absolute", flag]);
  return isOk(resolved) ? ok(resolved.value.trim()) : resolved;
}

export function worktreeGitLayout(
  worktreePath: string,
): Result<WorktreeGitLayout, WorktreeRefusal> {
  const gitDir = absoluteGitPath(worktreePath, "--git-dir");
  if (isErr(gitDir)) return gitDir;
  const commonGitDir = absoluteGitPath(worktreePath, "--git-common-dir");
  if (isErr(commonGitDir)) return commonGitDir;
  return gitDir.value === commonGitDir.value
    ? ok({ kind: "not-linked" })
    : ok({ kind: "linked", commonGitDir: commonGitDir.value, gitDir: gitDir.value });
}

export function createDetachedWorktree(
  repoRoot: string,
  path: string,
  sha: string,
): Result<string, WorktreeRefusal> {
  const added = git(repoRoot, ["worktree", "add", "--detach", path, sha]);
  return isOk(added) ? ok(path) : added;
}

export function removeWorktree(repoRoot: string, path: string): Result<void, WorktreeRefusal> {
  const removed = git(repoRoot, ["worktree", "remove", "--force", path]);
  return isOk(removed) ? ok(undefined) : removed;
}

export function withAutoMaintenanceDisabled(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const declared = Number.parseInt(base["GIT_CONFIG_COUNT"] ?? "0", 10);
  const next = Number.isInteger(declared) && declared > 0 ? declared : 0;
  return {
    ...base,
    GIT_CONFIG_COUNT: String(next + 1),
    [`GIT_CONFIG_KEY_${next}`]: "maintenance.auto",
    [`GIT_CONFIG_VALUE_${next}`]: "false",
  };
}
