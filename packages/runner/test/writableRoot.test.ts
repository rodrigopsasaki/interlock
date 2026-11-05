import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@phyxiusjs/fp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, 'writable-root "proof" ')));
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

  it("commits in a linked worktree only once the production launch supplies the common git dir", async () => {
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

    expect(rooted.roots).toEqual([commonGitDir]);
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

    console.log(`${PROOF}: passed`);
  });
});
