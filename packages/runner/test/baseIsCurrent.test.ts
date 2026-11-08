import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, unwrap } from "@phyxiusjs/fp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { ensureNodeWorktree, mainBranchOf } from "../src/worktree.ts";
import {
  driveOnce,
  fixtureRepository,
  isolateGitForThisProcess,
  legacyLocalYaml,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";
import { commitAll, headSha } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = mkdtempSync(join(runsRoot, "base-is-current-"));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture() {
  if (directory === undefined) throw new Error("expected a test directory");
  const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: fake"]));
  writeFileSync(join(repoRoot, ".gitignore"), ".worktrees/\n");
  commitAll(repoRoot, "ignore fixture worktrees");
  const cataloguePath = join(directory, "runtimes.yaml");
  writeFileSync(
    cataloguePath,
    [
      "interlock: runtimes@v0",
      "runtimes:",
      "  fixture:",
      "    kind: fake",
      "    model: fixture-model",
      "    commits: runner",
      "",
    ].join("\n"),
  );
  const selected = await selectedRuntime(repoRoot, cataloguePath, "fixture");
  return { repoRoot, ...selected };
}

function worktreePath(repoRoot: string): string {
  return join(repoRoot, ".worktrees", "n");
}

function branch(): string {
  return "graph/g/n";
}

function statusSnapshot(path: string): readonly string[] {
  return [
    headSha(path),
    fixtureGit(["status", "--porcelain", "-z"], { cwd: path }),
    fixtureGit(["diff", "--cached", "--binary"], { cwd: path }),
    readFileSync(join(path, "untracked.txt"), "utf-8"),
  ];
}

describe("base-is-current admission", () => {
  it("refuses a stale code branch before lease or agent and leaves its worktree unchanged", async () => {
    const { repoRoot, localConfig, agentRuntime } = await fixture();
    const oldMain = headSha(repoRoot);
    const path = worktreePath(repoRoot);
    unwrap(ensureNodeWorktree(repoRoot, path, oldMain, branch()));
    writeFileSync(join(path, "agent.txt"), "agent commit\n");
    commitAll(path, "agent work");
    writeFileSync(join(path, "staged.txt"), "staged\n");
    fixtureGit(["add", "staged.txt"], { cwd: path });
    writeFileSync(join(path, "untracked.txt"), "untracked\n");
    const before = statusSnapshot(path);

    writeFileSync(join(repoRoot, "code-change.txt"), "main code\n");
    commitAll(repoRoot, "main code change");
    const sampledMain = headSha(repoRoot);

    const recording = recordingRuntime();
    const result = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recording.runtime);

    expect(result.outcome.exitCode).toBe(1);
    expect(result.outcome.message).toContain("stale base");
    expect(result.outcome.message).toContain(branch());
    expect(result.outcome.message).toContain(oldMain);
    expect(result.outcome.message).toContain(sampledMain);
    expect(result.outcome.message).toContain("1 commit(s) gained");
    expect(result.outcome.message).toContain("changes outside .interlock/: yes");
    expect(result.outcome.message).toContain("fresh worktree");
    expect(recording.paneOpens).toEqual([]);
    expect(recording.starts).toEqual([]);
    expect(result.events.some((event) => event.kind === "lease-taken")).toBe(false);
    expect(statusSnapshot(path)).toEqual(before);
    expect(headSha(repoRoot)).toBe(sampledMain);
  });

  it("proceeds on a stale branch when main gained only .interlock changes and narrates it", async () => {
    const { repoRoot, localConfig, agentRuntime } = await fixture();
    const oldMain = headSha(repoRoot);
    const path = worktreePath(repoRoot);
    unwrap(ensureNodeWorktree(repoRoot, path, oldMain, branch()));
    writeFileSync(join(path, "agent.txt"), "agent commit\n");
    commitAll(path, "agent work");
    mkdirSync(join(repoRoot, ".interlock", "progress"));
    writeFileSync(join(repoRoot, ".interlock", "progress", "main.txt"), "ledger progress\n");
    commitAll(repoRoot, "main ledger progress");

    const recording = recordingRuntime();
    const result = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recording.runtime);

    expect(result.outcome.exitCode).toBe(1);
    expect(result.narrated).toContain(
      "main advanced by 1 commit(s) since the branch base; changes are only under .interlock/, so the attempt proceeds on its existing base",
    );
    expect(recording.paneOpens).toEqual([path]);
    expect(result.events.some((event) => event.kind === "lease-taken")).toBe(true);
    expect(headSha(path)).not.toBe(headSha(repoRoot));
  });

  it("resets a branch with no own commits to the sampled main", () => {
    const repoRoot = fixtureRoot();
    const oldMain = headSha(repoRoot);
    const path = worktreePath(repoRoot);
    unwrap(ensureNodeWorktree(repoRoot, path, oldMain, branch()));
    writeFileSync(join(repoRoot, "main-code.txt"), "new main code\n");
    commitAll(repoRoot, "main moved");
    const sampledMain = headSha(repoRoot);

    const result = ensureNodeWorktree(repoRoot, path, sampledMain, branch());

    expect(isOk(result)).toBe(true);
    expect(headSha(path)).toBe(sampledMain);
    expect(existsSync(join(path, "main-code.txt"))).toBe(true);
  });

  it("reads a reattached branch's true base before refusing its stale code commits", () => {
    const repoRoot = fixtureRoot();
    const oldMain = headSha(repoRoot);
    fixtureGit(["branch", branch()], { cwd: repoRoot });
    fixtureGit(["switch", branch()], { cwd: repoRoot });
    writeFileSync(join(repoRoot, "agent.txt"), "agent commit\n");
    commitAll(repoRoot, "agent work");
    fixtureGit(["switch", "main"], { cwd: repoRoot });
    writeFileSync(join(repoRoot, "code-change.txt"), "main code\n");
    commitAll(repoRoot, "main code change");
    const sampledMain = headSha(repoRoot);

    const result = ensureNodeWorktree(repoRoot, worktreePath(repoRoot), sampledMain, branch());

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected a stale-base refusal");
    expect(result.error.kind).toBe("stale-base");
    if (result.error.kind === "stale-base") {
      expect(result.error.base).toBe(oldMain);
      expect(result.error.commitsBeyondBase).toBe(1);
    }
  });

  it("resolves main when the caller checkout is on another branch", () => {
    const repoRoot = fixtureRoot();
    const main = headSha(repoRoot);
    fixtureGit(["switch", "-c", "caller-branch"], { cwd: repoRoot });

    const result = mainBranchOf(repoRoot);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toEqual({ branch: "main", sha: main });
  });
});

function fixtureRoot(): string {
  if (directory === undefined) throw new Error("expected a test directory");
  const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: fake"]));
  writeFileSync(join(repoRoot, ".gitignore"), ".worktrees/\n");
  commitAll(repoRoot, "ignore fixture worktrees");
  return repoRoot;
}
