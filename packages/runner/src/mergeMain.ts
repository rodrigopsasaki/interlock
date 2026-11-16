import { spawnSync } from "node:child_process";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { explainWorktreeSetupRefusal, runSetupCommand } from "./worktreeSetup.ts";

interface GitExecution {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

const LOCKFILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);

export type FrozenInstall = (
  worktree: string,
  env: NodeJS.ProcessEnv,
  heavy: readonly string[],
) => Promise<Result<void, string>>;

export interface MergeMainRequest {
  readonly worktree: string;
  readonly node: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly heavy?: readonly string[];
  readonly install?: FrozenInstall;
}

export type MergeMainOutcome =
  | {
      readonly kind: "unchanged";
      readonly mainRef: string | undefined;
    }
  | {
      readonly kind: "merged";
      readonly mainRef: string;
      readonly lockfileChanged: boolean;
    };

export type MergeMainRefusal =
  | { readonly kind: "git"; readonly command: readonly string[]; readonly because: string }
  | { readonly kind: "dirty"; readonly paths: readonly string[] }
  | { readonly kind: "conflict"; readonly paths: readonly string[] }
  | { readonly kind: "merge"; readonly because: string }
  | { readonly kind: "install"; readonly because: string };

function executeGit(cwd: string, args: readonly string[]): GitExecution {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  const stderr = typeof result.stderr === "string" ? result.stderr : "";
  if (result.error !== undefined) {
    return { code: -1, stdout, stderr: result.error.message };
  }
  return { code: result.status ?? -1, stdout, stderr };
}

function gitFailure(execution: GitExecution): string {
  const output = `${execution.stderr}${execution.stdout}`.trim();
  return output.length === 0 ? `git exited ${execution.code}` : output;
}

function isMissingRepository(execution: GitExecution): boolean {
  return `${execution.stderr}${execution.stdout}`.includes("not a git repository");
}

function runGit(cwd: string, args: readonly string[]): Result<string, string> {
  const execution = executeGit(cwd, args);
  return execution.code === 0 ? ok(execution.stdout) : err(gitFailure(execution));
}

function parsePaths(output: string): readonly string[] {
  const paths = new Set<string>();
  for (const record of output.split("\0")) {
    if (record.length > 0) paths.add(record);
  }
  if (paths.size > 0) return [...paths];
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function statusPaths(output: string): readonly string[] {
  const paths = new Set<string>();
  const records = output.split("\0");
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length === 0) continue;
    paths.add(record.slice(3));
    if (record.slice(0, 2).includes("R") || record.slice(0, 2).includes("C")) {
      const source = records[index + 1];
      if (source !== undefined && source.length > 0) paths.add(source);
      index += 1;
    }
  }
  return [...paths].filter((path) => path.length > 0);
}

function resolveMainRef(worktree: string): Result<string | undefined, string> {
  for (const candidate of ["origin/main", "main"]) {
    const resolved = executeGit(worktree, ["rev-parse", "--verify", "--quiet", candidate]);
    if (resolved.code === 0) return ok(candidate);
  }
  return ok(undefined);
}

function isLockfile(path: string): boolean {
  return LOCKFILES.has(path);
}

function conflictPaths(output: string): readonly string[] {
  const names = [...output.matchAll(/CONFLICT[^\n]* in ([^\n]+)/g)].map((match) => match[1]);
  return names.filter((name): name is string => name !== undefined && name.length > 0);
}

function defaultInstall(
  worktree: string,
  env: NodeJS.ProcessEnv,
  heavy: readonly string[],
): Promise<Result<void, string>> {
  return runSetupCommand("pnpm install --frozen-lockfile", worktree, env, heavy).then((result) =>
    isErr(result) ? err(explainWorktreeSetupRefusal(result.error)) : ok(undefined),
  );
}

export function explainMergeMainRefusal(refusal: MergeMainRefusal): string {
  switch (refusal.kind) {
    case "git":
      return `git ${refusal.command.join(" ")}: ${refusal.because}`;
    case "dirty":
      return `dirty worktree; refusing to merge main. Uncommitted files: ${refusal.paths.join(", ")}`;
    case "conflict":
      return `merge conflict; refusing to judge. Conflicting files: ${refusal.paths.join(", ")}`;
    case "merge":
      return `signed merge refused: ${refusal.because}`;
    case "install":
      return `frozen install refused after merging main: ${refusal.because}`;
  }
}

export async function mergeMainIntoWorktree(
  request: MergeMainRequest,
): Promise<Result<MergeMainOutcome, MergeMainRefusal>> {
  const repository = executeGit(request.worktree, ["rev-parse", "--git-dir"]);
  if (repository.code !== 0) {
    if (isMissingRepository(repository)) return ok({ kind: "unchanged", mainRef: undefined });
    return err({
      kind: "git",
      command: ["rev-parse", "--git-dir"],
      because: gitFailure(repository),
    });
  }
  const status = executeGit(request.worktree, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=no",
  ]);
  if (status.code !== 0) {
    return err({
      kind: "git",
      command: ["status", "--porcelain=v1", "-z", "--untracked-files=no"],
      because: gitFailure(status),
    });
  }
  const dirtyPaths = statusPaths(status.stdout);
  if (dirtyPaths.length > 0) return err({ kind: "dirty", paths: dirtyPaths });

  const mainRef = resolveMainRef(request.worktree);
  if (isErr(mainRef)) {
    return err({
      kind: "git",
      command: ["rev-parse", "--verify", "origin/main"],
      because: mainRef.error,
    });
  }
  if (mainRef.value === undefined) return ok({ kind: "unchanged", mainRef: undefined });

  const ancestor = executeGit(request.worktree, [
    "merge-base",
    "--is-ancestor",
    mainRef.value,
    "HEAD",
  ]);
  if (ancestor.code !== 0 && ancestor.code !== 1) {
    return err({
      kind: "git",
      command: ["merge-base", "--is-ancestor", mainRef.value, "HEAD"],
      because: gitFailure(ancestor),
    });
  }
  if (ancestor.code === 0) return ok({ kind: "unchanged", mainRef: mainRef.value });

  const planned = executeGit(request.worktree, [
    "merge-tree",
    "--write-tree",
    "--name-only",
    "--no-messages",
    "-z",
    "HEAD",
    mainRef.value,
  ]);
  if (planned.code !== 0) {
    const paths = conflictPaths(planned.stdout);
    return err({
      kind: "conflict",
      paths: paths.length > 0 ? paths : parsePaths(planned.stdout),
    });
  }

  const before = runGit(request.worktree, ["rev-parse", "HEAD"]);
  if (isErr(before)) {
    return err({ kind: "git", command: ["rev-parse", "HEAD"], because: before.error });
  }
  const mergeArgs = [
    "merge",
    "--no-ff",
    "-S",
    "-m",
    `Merge ${mainRef.value} before judging ${request.node}`,
    mainRef.value,
  ] as const;
  const merged = executeGit(request.worktree, mergeArgs);
  if (merged.code !== 0) {
    const mergeHead = executeGit(request.worktree, [
      "rev-parse",
      "--verify",
      "--quiet",
      "MERGE_HEAD",
    ]);
    if (mergeHead.code === 0) executeGit(request.worktree, ["merge", "--abort"]);
    return err({ kind: "merge", because: gitFailure(merged) });
  }

  const after = runGit(request.worktree, ["rev-parse", "HEAD"]);
  if (isErr(after)) {
    return err({ kind: "git", command: ["rev-parse", "HEAD"], because: after.error });
  }
  const changed = runGit(request.worktree, [
    "diff",
    "--name-only",
    "--no-renames",
    before.value.trim(),
    after.value.trim(),
  ]);
  if (isErr(changed)) {
    return err({
      kind: "git",
      command: ["diff", "--name-only", "--no-renames", before.value.trim(), after.value.trim()],
      because: changed.error,
    });
  }
  const lockfileChanged = changed.value.split(/\r?\n/).some((path) => isLockfile(path));
  if (!lockfileChanged)
    return ok({ kind: "merged", mainRef: mainRef.value, lockfileChanged: false });

  const env = request.env ?? process.env;
  const heavy = request.heavy ?? [];
  const install = request.install ?? defaultInstall;
  const installed = await install(request.worktree, env, heavy);
  if (isErr(installed)) return err({ kind: "install", because: installed.error });
  return ok({ kind: "merged", mainRef: mainRef.value, lockfileChanged: true });
}
