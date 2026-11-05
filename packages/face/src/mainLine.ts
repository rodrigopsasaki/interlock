import { spawn } from "node:child_process";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";

export const GIT_CHILDREN_BOUND = 8;

export interface GitRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export type GitRunner = (
  repoRoot: string,
  args: readonly string[],
  input?: string,
) => Promise<GitRun>;

export const spawnedGit: GitRunner = (repoRoot, args, input) =>
  new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: repoRoot,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.stdin.on("error", () => undefined);
    child.on("error", (error) => resolve({ status: null, stdout: "", stderr: error.message }));
    child.on("close", (status) =>
      resolve({
        status,
        stdout: Buffer.concat(stdout).toString("utf-8"),
        stderr: Buffer.concat(stderr).toString("utf-8"),
      }),
    );
    child.stdin.end(input);
  });

export function boundedGit(
  bound: number = GIT_CHILDREN_BOUND,
  run: GitRunner = spawnedGit,
): GitRunner {
  let running = 0;
  const waiting: (() => void)[] = [];
  const acquire = (): Promise<void> => {
    if (running < bound) {
      running += 1;
      return Promise.resolve();
    }
    return new Promise((resolve) =>
      waiting.push(() => {
        running += 1;
        resolve();
      }),
    );
  };
  const release = (): void => {
    running -= 1;
    waiting.shift()?.();
  };
  return async (repoRoot, args, input) => {
    await acquire();
    try {
      return await run(repoRoot, args, input);
    } finally {
      release();
    }
  };
}

export interface RepoGit {
  readonly repoRoot: string;
  readonly run: GitRunner;
}

function refused(args: readonly string[], run: GitRun): string {
  const said = run.stderr.trim().split("\n")[0] ?? "";
  return `git refused \`git ${args.join(" ")}\`${said.length > 0 ? `: ${said}` : ""}`;
}

async function read(
  git: RepoGit,
  args: readonly string[],
  input?: string,
): Promise<Result<string, string>> {
  const run = await git.run(git.repoRoot, args, input);
  return run.status === 0 ? ok(run.stdout) : err(refused(args, run));
}

async function answers(git: RepoGit, args: readonly string[]): Promise<Result<boolean, string>> {
  const run = await git.run(git.repoRoot, args);
  if (run.status === 0) return ok(true);
  if (run.status === 1) return ok(false);
  return err(refused(args, run));
}

function lines(output: string): readonly string[] {
  return output.split("\n").filter((line) => line.length > 0);
}

export interface MainSnapshot {
  readonly branch: string;
  readonly sha: string;
}

const ORIGIN_HEAD = "refs/remotes/origin/HEAD";
const ORIGIN_PREFIX = "refs/remotes/origin/";
const BRANCH_PREFIX = "refs/heads/";

export async function mainSnapshotOf(
  git: RepoGit,
): Promise<Result<MainSnapshot | undefined, string>> {
  const listed = await read(git, [
    "for-each-ref",
    "--format=%(refname)%00%(objectname)%00%(objecttype)%00%(symref)",
    BRANCH_PREFIX,
    ORIGIN_HEAD,
  ]);
  if (isErr(listed)) return listed;
  const branches = new Map<string, string>();
  let originNames: string | undefined;
  for (const line of lines(listed.value)) {
    const [refname, objectname, objecttype, symref] = line.split("\u0000");
    if (refname === ORIGIN_HEAD) {
      originNames = symref?.startsWith(ORIGIN_PREFIX)
        ? symref.slice(ORIGIN_PREFIX.length)
        : undefined;
    } else if (
      refname?.startsWith(BRANCH_PREFIX) &&
      objecttype === "commit" &&
      objectname !== undefined
    ) {
      branches.set(refname.slice(BRANCH_PREFIX.length), objectname);
    }
  }
  for (const branch of [originNames, "main", "master"]) {
    const sha = branch === undefined ? undefined : branches.get(branch);
    if (branch !== undefined && sha !== undefined) return ok({ branch, sha });
  }
  return ok(undefined);
}

export async function commitsPresent(
  git: RepoGit,
  shas: readonly string[],
): Promise<Result<readonly boolean[], string>> {
  const checked = await read(
    git,
    ["cat-file", "--batch-check=%(objecttype)"],
    shas.map((sha) => `${sha}^{commit}\n`).join(""),
  );
  if (isErr(checked)) return checked;
  return ok(lines(checked.value).map((line) => line === "commit"));
}

export function isAncestor(
  git: RepoGit,
  ancestor: string,
  descendant: string,
): Promise<Result<boolean, string>> {
  return answers(git, ["merge-base", "--is-ancestor", ancestor, descendant]);
}

const RECORD = "\u001e";
const FIELD = "\u001f";

export interface AttemptCommit {
  readonly commit: string;
  readonly paths: readonly string[];
}

export async function attemptCommits(
  git: RepoGit,
  base: string,
  head: string,
): Promise<Result<readonly AttemptCommit[], string>> {
  const logged = await read(git, [
    "log",
    "--reverse",
    "--no-renames",
    `--format=${RECORD}%H${FIELD}`,
    "--name-only",
    `${base}..${head}`,
  ]);
  if (isErr(logged)) return logged;
  return ok(
    logged.value.split(RECORD).flatMap((record) => {
      const [commit, names] = record.split(FIELD);
      return commit === undefined || commit.length === 0
        ? []
        : [{ commit, paths: lines(names ?? "") }];
    }),
  );
}

export interface MainCommit {
  readonly commit: string;
  readonly committedAt: number;
  readonly message: string;
  readonly paths: readonly string[];
}

export async function mainCommits(
  git: RepoGit,
  base: string,
  main: string,
  scope: readonly string[],
): Promise<Result<readonly MainCommit[], string>> {
  if (scope.length === 0) return ok([]);
  const logged = await read(git, [
    "log",
    "--reverse",
    "--no-renames",
    `--format=${RECORD}%H${FIELD}%ct${FIELD}%B${FIELD}`,
    "--name-only",
    `${base}..${main}`,
    "--",
    ...scope,
  ]);
  if (isErr(logged)) return logged;
  return ok(
    logged.value.split(RECORD).flatMap((record) => {
      const [commit, committedAt, message, names] = record.split(FIELD);
      return commit === undefined || commit.length === 0 || message === undefined
        ? []
        : [
            {
              commit,
              committedAt: Number(committedAt),
              message,
              paths: lines(names ?? ""),
            },
          ];
    }),
  );
}

export const STABLE_DIFF_OPTIONS: readonly string[] = [
  "--no-color",
  "--no-ext-diff",
  "--no-textconv",
  "--no-renames",
  "--no-prefix",
  "--unified=3",
];

async function patchIdsOf(
  git: RepoGit,
  patches: string,
): Promise<Result<ReadonlyMap<string, string>, string>> {
  if (patches.length === 0) return ok(new Map());
  const identified = await read(git, ["patch-id", "--stable"], patches);
  if (isErr(identified)) return identified;
  const ids = new Map<string, string>();
  for (const line of lines(identified.value)) {
    const [patchId, commit] = line.split(" ");
    if (patchId !== undefined && commit !== undefined) ids.set(commit, patchId);
  }
  return ok(ids);
}

export type PatchDirection = "forward" | "inverse";

export async function commitPatchIds(
  git: RepoGit,
  range: string,
  scope: readonly string[],
  direction: PatchDirection,
): Promise<Result<ReadonlyMap<string, string>, string>> {
  if (scope.length === 0) return ok(new Map());
  const logged = await read(git, [
    "log",
    "--reverse",
    "-p",
    ...STABLE_DIFF_OPTIONS,
    ...(direction === "inverse" ? ["-R"] : []),
    range,
    "--",
    ...scope,
  ]);
  if (isErr(logged)) return logged;
  return patchIdsOf(git, logged.value);
}

export interface WholePatchIds {
  readonly forward: string | undefined;
  readonly inverse: string | undefined;
}

export async function wholePatchIds(
  git: RepoGit,
  base: string,
  head: string,
  scope: readonly string[],
): Promise<Result<WholePatchIds, string>> {
  if (scope.length === 0) return ok({ forward: undefined, inverse: undefined });
  const forward = await read(git, ["diff", ...STABLE_DIFF_OPTIONS, base, head, "--", ...scope]);
  if (isErr(forward)) return forward;
  const inverse = await read(git, ["diff", ...STABLE_DIFF_OPTIONS, head, base, "--", ...scope]);
  if (isErr(inverse)) return inverse;
  const ids = await patchIdsOf(
    git,
    [
      ...(forward.value.length > 0 ? [`commit ${head}\n`, forward.value] : []),
      ...(inverse.value.length > 0 ? [`commit ${base}\n`, inverse.value] : []),
    ].join(""),
  );
  if (isErr(ids)) return ids;
  return ok({ forward: ids.value.get(head), inverse: ids.value.get(base) });
}
