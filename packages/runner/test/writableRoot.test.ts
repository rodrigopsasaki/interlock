import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { ok } from "@phyxiusjs/fp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  driveOnce,
  fixtureRepository,
  isolatedGitEnvironment,
  isolateGitForThisProcess,
  legacyLocalYaml,
  type RecordedStart,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const PROOF = "writable-root-sandbox-proof";
const TEST_WRITE_ROOT = "--test-write-root";
const STAGED_PATH = "staged.txt";
const STAGED_CONTENT = "staged before the fake agent launched\n";
const FRESH_PATH = "fresh.txt";
const FRESH_CONTENT = "added inside the metadata-protecting sandbox\n";
const BRANCH = "graph/g/n";
const passedProofs = new Set<string>();
const PROOFS = ["generic boundary", "metadata exclusion"];

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, 'writable-root "proof" ')));
});

afterAll(() => {
  if (PROOFS.every((proof) => passedProofs.has(proof))) console.log(`${PROOF}: passed`);
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function sandboxString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

// The fake runtime's whole sandbox: reads anywhere, writes only beneath cwd and each root its
// argv names. /dev/null is a device git opens read-write at startup; nothing persists there.
function sandboxPolicy(cwd: string, roots: readonly string[]): string {
  const writable = [cwd, ...roots].map((path) => `(subpath ${sandboxString(realpathSync(path))})`);
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    '(allow file-write* (literal "/dev/null"))',
    `(allow file-write* ${writable.join(" ")})`,
  ].join("\n");
}

// Provenance of the metadata-protecting policy. Graph 0049's read
// (.interlock/graphs/0049-worktree-gitdir.yaml) records a smoke run on 2026-11-05 at about
// 04:50 UTC: a workspace-write sandbox given the common git dir as an explicit writable root still
// refused <common>/worktrees/<name>/index.lock, and adding the per-worktree git dir let the index
// write. The rule below is inferred from those observed denials, not copied from that runtime's
// source: git metadata beneath a writable root is excluded from it, and the exclusion lifts only
// for a root that names the metadata directory itself.
function metadataProtectingPolicy(cwd: string, roots: readonly string[]): string {
  const canonicalCwd = realpathSync(cwd);
  const pointer = join(canonicalCwd, ".git");
  const metadata = [pointer, perWorktreeGitDirNamedBy(pointer)];
  const writable = [canonicalCwd, ...roots.map((root) => realpathSync(root))].map((root) => {
    const excluded = metadata.filter((path) => path.startsWith(`${root}/`));
    const exclusions = excluded.map((path) => ` (require-not (subpath ${sandboxString(path)}))`);
    return `(require-all (subpath ${sandboxString(root)})${exclusions.join("")})`;
  });
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    '(allow file-write* (literal "/dev/null"))',
    `(allow file-write* ${writable.join(" ")})`,
  ].join("\n");
}

function perWorktreeGitDirNamedBy(pointer: string): string {
  const line = readFileSync(pointer, "utf-8").trim();
  const prefix = "gitdir: ";
  if (!line.startsWith(prefix)) throw new Error(`${pointer} is not a gitdir pointer: ${line}`);
  const named = line.slice(prefix.length);
  return realpathSync(isAbsolute(named) ? named : resolve(pointer, "..", named));
}

function rootsNamedBy(args: readonly string[]): readonly string[] {
  return args.flatMap((arg, index) => {
    const next = args[index + 1];
    return arg === TEST_WRITE_ROOT && next !== undefined ? [next] : [];
  });
}

interface Sandboxed {
  readonly status: number | null;
  readonly stderr: string;
}

function sandboxed(policy: string, cwd: string, command: readonly string[]): Sandboxed {
  const run = spawnSync("sandbox-exec", ["-p", policy, ...command], {
    cwd,
    env: isolatedGitEnvironment(),
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.error !== undefined) throw run.error;
  return { status: run.status, stderr: run.stderr };
}

interface FakeAgentRun {
  readonly roots: readonly string[];
  readonly initialized: Sandboxed;
  readonly headBefore: string;
  readonly commit: Sandboxed;
  readonly headAfter: string;
  readonly outsideWrite: Sandboxed;
}

function head(cwd: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf-8" }).trim();
}

function fakeAgent(start: RecordedStart, outsideFile: string): FakeAgentRun {
  const roots = rootsNamedBy(start.args);
  const policy = sandboxPolicy(start.cwd, roots);
  const initialized = sandboxed(policy, start.cwd, ["/usr/bin/true"]);
  const headBefore = head(start.cwd);
  const commit = sandboxed(policy, start.cwd, [
    "git",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "fake agent commit",
  ]);
  const headAfter = head(start.cwd);
  const outsideWrite = sandboxed(policy, start.cwd, [
    "/bin/sh",
    "-c",
    'printf escaped > "$1"',
    "sh",
    outsideFile,
  ]);
  return { roots, initialized, headBefore, commit, headAfter, outsideWrite };
}

function runDirectory(): string {
  if (directory === undefined) throw new Error("no run directory");
  return directory;
}

describe("writable root sandbox proof", () => {
  if (process.platform !== "darwin") {
    it.skip(`${PROOF}: skipped, sandbox-exec exists only on macOS (${process.platform})`, () => {});
    console.log(
      `${PROOF}: skipped on ${process.platform}; this platform does not satisfy the proof`,
    );
    return;
  }

  it("commits in a linked worktree only once the production launch supplies its git dirs", async () => {
    const run = runDirectory();
    const repoRoot = fixtureRepository(run, legacyLocalYaml(["kind: fake", "args: []"]));
    const cataloguePath = join(run, "runtimes.yaml");
    writeFileSync(
      cataloguePath,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  cwd-only:",
        "    kind: fake",
        "    model: m",
        "  rooted:",
        "    kind: fake",
        "    model: m",
        `    writable_root_args: [${TEST_WRITE_ROOT}, "{path}"]`,
        "",
      ].join("\n"),
    );
    const outside = join(run, "outside");
    mkdirSync(outside);
    const outsideFile = join(outside, "escaped.txt");

    const worktree = join(repoRoot, ".worktrees", "n");
    execFileSync("git", ["worktree", "add", "--quiet", "-b", "graph/g/n", worktree, "HEAD"], {
      cwd: repoRoot,
    });
    writeFileSync(join(worktree, STAGED_PATH), STAGED_CONTENT);
    execFileSync("git", ["add", "--", STAGED_PATH], { cwd: worktree });
    const commonGitDir = join(repoRoot, ".git");

    const runs: FakeAgentRun[] = [];
    const launch = async (name: string) => {
      const { localConfig, agentRuntime } = await selectedRuntime(repoRoot, cataloguePath, name);
      const recorded = recordingRuntime((start) => {
        runs.push(fakeAgent(start, outsideFile));
        return ok(undefined);
      });
      await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);
      expect(recorded.starts.map((start) => start.cwd)).toEqual([worktree]);
    };

    await launch("cwd-only");
    await launch("rooted");

    const [cwdOnly, rooted] = runs;
    if (cwdOnly === undefined || rooted === undefined) throw new Error("the fake agent ran twice");

    expect(cwdOnly.initialized).toEqual({ status: 0, stderr: "" });
    expect(rooted.initialized).toEqual({ status: 0, stderr: "" });

    expect(cwdOnly.roots).toEqual([]);
    expect(cwdOnly.commit.status).not.toBe(0);
    expect(cwdOnly.commit.stderr).toContain("Operation not permitted");
    expect(cwdOnly.headAfter).toBe(cwdOnly.headBefore);

    expect(rooted.roots).toEqual([commonGitDir, join(commonGitDir, "worktrees", "n")]);
    expect(rooted.headBefore).toBe(cwdOnly.headBefore);
    expect(rooted.commit).toEqual({ status: 0, stderr: "" });
    expect(rooted.headAfter).not.toBe(rooted.headBefore);
    expect(head(worktree)).toBe(rooted.headAfter);
    expect(
      execFileSync("git", ["rev-parse", "HEAD^"], { cwd: worktree, encoding: "utf-8" }).trim(),
    ).toBe(rooted.headBefore);
    expect(
      execFileSync("git", ["show", `HEAD:${STAGED_PATH}`], { cwd: worktree, encoding: "utf-8" }),
    ).toBe(STAGED_CONTENT);

    expect(rooted.outsideWrite.status).not.toBe(0);
    expect(rooted.outsideWrite.stderr).toContain("Operation not permitted");
    expect(existsSync(outsideFile)).toBe(false);

    passedProofs.add("generic boundary");
  });

  it("adds and commits under metadata protection only with both production roots", async () => {
    const run = runDirectory();
    const repoRoot = fixtureRepository(run, legacyLocalYaml(["kind: fake", "args: []"]));
    const cataloguePath = join(run, "runtimes.yaml");
    writeFileSync(
      cataloguePath,
      [
        "interlock: runtimes@v0",
        "runtimes:",
        "  rooted:",
        "    kind: fake",
        "    model: m",
        `    writable_root_args: [${TEST_WRITE_ROOT}, "{path}"]`,
        "",
      ].join("\n"),
    );
    const outside = join(run, "outside");
    mkdirSync(outside);
    const outsideFile = join(outside, "escaped.txt");
    const worktree = join(repoRoot, ".worktrees", "n");
    const commonGitDir = join(repoRoot, ".git");
    const perWorktreeGitDir = join(commonGitDir, "worktrees", "n");
    const indexFile = join(perWorktreeGitDir, "index");
    const branchRef = join(commonGitDir, "refs", "heads", ...BRANCH.split("/"));
    const branchReflog = join(commonGitDir, "logs", "refs", "heads", ...BRANCH.split("/"));
    const headReflog = join(perWorktreeGitDir, "logs", "HEAD");

    const attempts: MetadataAttempt[] = [];
    const { localConfig, agentRuntime } = await selectedRuntime(repoRoot, cataloguePath, "rooted");
    const recorded = recordingRuntime((start) => {
      const productionRoots = rootsNamedBy(start.args);
      writeFileSync(join(start.cwd, FRESH_PATH), FRESH_CONTENT);
      attempts.push(
        metadataAttempt(
          start.cwd,
          productionRoots.filter((root) => root === commonGitDir),
          outsideFile,
          { indexFile, branchReflog, headReflog },
        ),
      );
      attempts.push(
        metadataAttempt(start.cwd, productionRoots, outsideFile, {
          indexFile,
          branchReflog,
          headReflog,
        }),
      );
      return ok(undefined);
    });
    await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);
    expect(recorded.starts.map((start) => start.cwd)).toEqual([worktree]);

    const [commonOnly, production] = attempts;
    if (commonOnly === undefined || production === undefined) {
      throw new Error("the fake agent ran both attempts");
    }

    expect(commonOnly.roots).toEqual([commonGitDir]);
    expect(commonOnly.add.status).not.toBe(0);
    expect(commonOnly.add.stderr).toContain(join(perWorktreeGitDir, "index.lock"));
    expect(commonOnly.add.stderr).toContain("Operation not permitted");
    expect(commonOnly.commit.status).not.toBe(0);
    expect(commonOnly.after).toEqual(commonOnly.before);

    expect(production.roots).toEqual([commonGitDir, perWorktreeGitDir]);
    expect(production.before).toEqual(commonOnly.before);
    expect(production.add).toEqual({ status: 0, stderr: "" });
    expect(production.commit).toEqual({ status: 0, stderr: "" });

    const { before, after } = production;
    expect(after.index).not.toEqual(before.index);
    const blob = git(worktree, ["hash-object", "--", FRESH_PATH]);
    expect(git(worktree, ["ls-files", "--stage", "--", FRESH_PATH])).toBe(
      `100644 ${blob} 0\t${FRESH_PATH}`,
    );
    expect(existsSync(join(commonGitDir, "objects", blob.slice(0, 2), blob.slice(2)))).toBe(true);
    expect(after.head).not.toBe(before.head);
    expect(git(worktree, ["cat-file", "-t", after.head])).toBe("commit");
    expect(git(worktree, ["rev-parse", "HEAD^"])).toBe(before.head);
    expect(git(worktree, ["show", `HEAD:${FRESH_PATH}`])).toBe(FRESH_CONTENT.trim());
    expect(git(worktree, ["log", "-1", "--format=%G?"])).toBe("N");

    expect(git(repoRoot, ["rev-parse", `refs/heads/${BRANCH}`])).toBe(after.head);
    expect(readFileSync(branchRef, "utf-8").trim()).toBe(after.head);
    expect(after.branchReflog).toHaveLength(before.branchReflog.length + 1);
    expect(after.branchReflog.at(-1)).toMatch(new RegExp(`^${before.head} ${after.head} `));
    expect(after.headReflog).toHaveLength(before.headReflog.length + 1);
    expect(after.headReflog.at(-1)).toMatch(new RegExp(`^${before.head} ${after.head} `));

    for (const attempt of attempts) {
      expect(attempt.outsideWrite.status).not.toBe(0);
      expect(attempt.outsideWrite.stderr).toContain("Operation not permitted");
      expect(attempt.pointerWrite.status).not.toBe(0);
      expect(attempt.pointerWrite.stderr).toContain("Operation not permitted");
    }
    expect(existsSync(outsideFile)).toBe(false);
    expect(readFileSync(join(worktree, ".git"), "utf-8").trim()).toBe(
      `gitdir: ${perWorktreeGitDir}`,
    );

    passedProofs.add("metadata exclusion");
  });
});

interface MetadataFiles {
  readonly indexFile: string;
  readonly branchReflog: string;
  readonly headReflog: string;
}

interface MetadataState {
  readonly head: string;
  readonly index: Buffer;
  readonly branchReflog: readonly string[];
  readonly headReflog: readonly string[];
}

interface MetadataAttempt {
  readonly roots: readonly string[];
  readonly before: MetadataState;
  readonly add: Sandboxed;
  readonly commit: Sandboxed;
  readonly after: MetadataState;
  readonly outsideWrite: Sandboxed;
  readonly pointerWrite: Sandboxed;
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...args], { cwd, encoding: "utf-8" }).trim();
}

function reflogLines(path: string): readonly string[] {
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.length > 0);
}

function metadataState(cwd: string, files: MetadataFiles): MetadataState {
  return {
    head: head(cwd),
    index: readFileSync(files.indexFile),
    branchReflog: reflogLines(files.branchReflog),
    headReflog: reflogLines(files.headReflog),
  };
}

const FIXTURE_GIT = ["git", "-c", "core.hooksPath=/dev/null", "-c", "core.logAllRefUpdates=true"];

function metadataAttempt(
  cwd: string,
  roots: readonly string[],
  outsideFile: string,
  files: MetadataFiles,
): MetadataAttempt {
  const policy = metadataProtectingPolicy(cwd, roots);
  const before = metadataState(cwd, files);
  const add = sandboxed(policy, cwd, [...FIXTURE_GIT, "add", "--", FRESH_PATH]);
  const commit = sandboxed(policy, cwd, [
    ...FIXTURE_GIT,
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--quiet",
    "-m",
    "fake agent commit under metadata protection",
  ]);
  const after = metadataState(cwd, files);
  const write = (target: string) =>
    sandboxed(policy, cwd, ["/bin/sh", "-c", 'printf escaped >> "$1"', "sh", target]);
  return {
    roots,
    before,
    add,
    commit,
    after,
    outsideWrite: write(outsideFile),
    pointerWrite: write(join(cwd, ".git")),
  };
}
