import { spawnSync } from "node:child_process";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";

const GIT_OUTPUT_PAST_SPAWN_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;

interface GitRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function git(repoRoot: string, args: readonly string[], input?: string): GitRun {
  const run = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    input,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    maxBuffer: GIT_OUTPUT_PAST_SPAWN_SYNC_ONE_MEGABYTE_DEFAULT,
  });
  return {
    status: run.status,
    stdout: run.stdout ?? "",
    stderr: run.error === undefined ? (run.stderr ?? "") : run.error.message,
  };
}

function refused(args: readonly string[], run: GitRun): string {
  const said = run.stderr.trim().split("\n")[0] ?? "";
  return `git refused \`git ${args.join(" ")}\`${said.length > 0 ? `: ${said}` : ""}`;
}

function read(repoRoot: string, args: readonly string[], input?: string): Result<string, string> {
  const run = git(repoRoot, args, input);
  return run.status === 0 ? ok(run.stdout) : err(refused(args, run));
}

function answers(repoRoot: string, args: readonly string[]): Result<boolean, string> {
  const run = git(repoRoot, args);
  if (run.status === 0) return ok(true);
  if (run.status === 1) return ok(false);
  return err(refused(args, run));
}

function lines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.length > 0);
}

function localBranchExists(repoRoot: string, branch: string): Result<boolean, string> {
  return answers(repoRoot, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`]);
}

function originHeadBranch(repoRoot: string): Result<string | undefined, string> {
  const args = ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"];
  const run = git(repoRoot, args);
  if (run.status === 1) return ok(undefined);
  if (run.status !== 0) return err(refused(args, run));
  const named = run.stdout.trim();
  const prefix = "refs/remotes/origin/";
  return ok(named.startsWith(prefix) ? named.slice(prefix.length) : undefined);
}

export function mainBranchOf(repoRoot: string): Result<string | undefined, string> {
  const origin = originHeadBranch(repoRoot);
  if (isErr(origin)) return origin;
  const candidates = [origin.value, "main", "master"].filter(
    (branch): branch is string => branch !== undefined,
  );
  for (const branch of candidates) {
    const exists = localBranchExists(repoRoot, branch);
    if (isErr(exists)) return exists;
    if (exists.value) return ok(branch);
  }
  return ok(undefined);
}

export function commitExists(repoRoot: string, sha: string): Result<boolean, string> {
  const run = git(repoRoot, ["cat-file", "-e", `${sha}^{commit}`]);
  return ok(run.status === 0);
}

export function isAncestor(
  repoRoot: string,
  ancestor: string,
  descendant: string,
): Result<boolean, string> {
  return answers(repoRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
}

export function commitsBetween(
  repoRoot: string,
  base: string,
  head: string,
): Result<readonly string[], string> {
  const listed = read(repoRoot, ["rev-list", "--reverse", `${base}..${head}`]);
  return isOk(listed) ? ok(lines(listed.value)) : listed;
}

export interface CherryEntry {
  readonly commit: string;
  readonly onUpstream: boolean;
}

export function cherry(
  repoRoot: string,
  upstream: string,
  head: string,
  limit: string,
): Result<readonly CherryEntry[], string> {
  const listed = read(repoRoot, ["cherry", upstream, head, limit]);
  if (isErr(listed)) return listed;
  return ok(
    lines(listed.value).map((line) => ({
      commit: line.slice(2).trim(),
      onUpstream: line.startsWith("-"),
    })),
  );
}

export function changedPaths(
  repoRoot: string,
  from: string,
  to: string,
): Result<readonly string[], string> {
  const listed = read(repoRoot, ["diff", "--no-renames", "--name-only", from, to]);
  return isOk(listed) ? ok(lines(listed.value)) : listed;
}

export interface CommitPatch {
  readonly commit: string;
  readonly patchId: string;
}

function patchIdsOf(repoRoot: string, patches: string): Result<readonly CommitPatch[], string> {
  const identified = read(repoRoot, ["patch-id", "--stable"], patches);
  if (isErr(identified)) return identified;
  return ok(
    lines(identified.value).flatMap((line) => {
      const [patchId, commit] = line.split(" ");
      return patchId === undefined || commit === undefined ? [] : [{ commit, patchId }];
    }),
  );
}

export function commitPatches(
  repoRoot: string,
  range: string,
  paths: readonly string[],
): Result<readonly CommitPatch[], string> {
  const logged = read(repoRoot, [
    "log",
    "--reverse",
    "--no-color",
    "--no-ext-diff",
    "--no-renames",
    "-p",
    range,
    "--",
    ...paths,
  ]);
  return isOk(logged) ? patchIdsOf(repoRoot, logged.value) : logged;
}

export function diffPatchId(
  repoRoot: string,
  from: string,
  to: string,
): Result<string | undefined, string> {
  const diffed = read(repoRoot, ["diff", "--no-color", "--no-ext-diff", "--no-renames", from, to]);
  if (isErr(diffed)) return diffed;
  if (diffed.value.length === 0) return ok(undefined);
  const identified = read(repoRoot, ["patch-id", "--stable"], diffed.value);
  if (isErr(identified)) return identified;
  return ok(identified.value.split(" ")[0]);
}

export interface CommitMessage {
  readonly commit: string;
  readonly message: string;
}

const RECORD = "\u001e";
const FIELD = "\u001f";

export function commitMessages(
  repoRoot: string,
  range: string,
  paths: readonly string[],
): Result<readonly CommitMessage[], string> {
  const logged = read(repoRoot, [
    "log",
    "--reverse",
    `--format=%H${FIELD}%B${RECORD}`,
    range,
    "--",
    ...paths,
  ]);
  if (isErr(logged)) return logged;
  return ok(
    logged.value.split(RECORD).flatMap((record) => {
      const [commit, message] = record.trim().split(FIELD);
      return commit === undefined || message === undefined || commit.length === 0
        ? []
        : [{ commit, message }];
    }),
  );
}
