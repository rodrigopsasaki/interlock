import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isErr, isOk, unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  commitBriefIfChanged,
  ensureNodeWorktree,
  explainWorktreeRefusal,
  uncommittedPaths,
} from "../src/worktree.ts";
import {
  commitAll,
  gitInitFixtureWithContent,
  headSha,
} from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".worktree-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRepo(): string {
  directory = mkdtempSync(join(runsRoot, "worktree-"));
  writeFileSync(join(directory, "root.txt"), "root\n");
  writeFileSync(join(directory, ".gitignore"), ".worktrees/\n");
  gitInitFixtureWithContent(directory);
  return directory;
}

describe("ensureNodeWorktree", () => {
  it("creates a fresh worktree on a new branch at the requested SHA", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");

    const result = ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a");

    expect(isOk(result)).toBe(true);
    expect(headSha(path)).toBe(sha);
    if (isOk(result)) expect(result.value).toEqual({ kind: "created", path });
  });

  it("is idempotent: asking for the base it is already on changes nothing", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a");

    const result = ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a");

    expect(isOk(result)).toBe(true);
    expect(headSha(path)).toBe(sha);
    if (isOk(result)) {
      expect(result.value).toEqual({
        kind: "reused",
        path,
        uncommittedPaths: 0,
        commitsBeyondBase: 0,
      });
    }
  });

  it("reuses a worktree whose branch carries commits beyond the requested base, naming how many", () => {
    const repoRoot = fixtureRepo();
    const firstSha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    const branch = "graph/demo/node-a";
    const created = ensureNodeWorktree(repoRoot, path, firstSha, branch);
    expect(isOk(created)).toBe(true);

    writeFileSync(join(path, "session-work.txt"), "the agent's own work\n");
    commitAll(path, "session work");
    writeFileSync(join(path, "more-work.txt"), "a second commit\n");
    commitAll(path, "more session work");
    const sessionSha = headSha(path);

    const result = ensureNodeWorktree(repoRoot, path, firstSha, branch);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toEqual({
        kind: "reused",
        path,
        uncommittedPaths: 0,
        commitsBeyondBase: 2,
      });
    }
    expect(headSha(path)).toBe(sessionSha);
  });

  it("refuses to reset a worktree behind its base over uncommitted work, naming the path count", () => {
    const repoRoot = fixtureRepo();
    const firstSha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    const branch = "graph/demo/node-a";
    const created = ensureNodeWorktree(repoRoot, path, firstSha, branch);
    expect(isOk(created)).toBe(true);

    writeFileSync(join(repoRoot, "merged.txt"), "merged after the fact\n");
    commitAll(repoRoot, "merge landed after the worktree was created");
    const laterSha = headSha(repoRoot);

    writeFileSync(join(path, "in-progress.txt"), "not committed yet\n");

    const result = ensureNodeWorktree(repoRoot, path, laterSha, branch);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected a refusal");
    expect(result.error).toEqual({
      kind: "dirty-behind-base",
      branch,
      paths: 1,
    });
    expect(explainWorktreeRefusal(result.error)).toContain(branch);
    expect(headSha(path)).toBe(firstSha);
    expect(existsSync(join(path, "in-progress.txt"))).toBe(true);
  });

  it("resets an existing worktree to a later base when its branch carries no commits of its own", () => {
    const repoRoot = fixtureRepo();
    const firstSha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    const branch = "graph/demo/node-a";
    const created = ensureNodeWorktree(repoRoot, path, firstSha, branch);
    expect(isOk(created)).toBe(true);

    writeFileSync(join(repoRoot, "merged.txt"), "merged after the fact\n");
    commitAll(repoRoot, "merge landed after the worktree was created");
    const laterSha = headSha(repoRoot);
    expect(laterSha).not.toBe(firstSha);

    const result = ensureNodeWorktree(repoRoot, path, laterSha, branch);

    expect(isOk(result)).toBe(true);
    expect(headSha(path)).toBe(laterSha);
    expect(existsSync(join(path, "merged.txt"))).toBe(true);
  });

  it("refuses to reset an existing worktree whose branch carries commits beyond its old base, naming the branch and the commit", () => {
    const repoRoot = fixtureRepo();
    const firstSha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    const branch = "graph/demo/node-a";
    const created = ensureNodeWorktree(repoRoot, path, firstSha, branch);
    expect(isOk(created)).toBe(true);

    writeFileSync(join(path, "session-work.txt"), "the agent's own work\n");
    commitAll(path, "session work");
    const sessionSha = headSha(path);

    writeFileSync(
      join(repoRoot, "unrelated.txt"),
      "an unrelated later commit\n",
    );
    commitAll(repoRoot, "unrelated later commit");
    const laterSha = headSha(repoRoot);

    const result = ensureNodeWorktree(repoRoot, path, laterSha, branch);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) throw new Error("expected a refusal");
    expect(result.error).toEqual({
      kind: "diverged",
      branch,
      commit: sessionSha,
    });
    expect(explainWorktreeRefusal(result.error)).toContain(branch);
    expect(explainWorktreeRefusal(result.error)).toContain(sessionSha);

    expect(headSha(path)).toBe(sessionSha);
    expect(existsSync(join(path, "session-work.txt"))).toBe(true);
    expect(readFileSync(join(path, "session-work.txt"), "utf-8")).toBe(
      "the agent's own work\n",
    );
  });

  it("refuses with a git failure sentence when the requested SHA does not exist", () => {
    const repoRoot = fixtureRepo();
    const path = join(repoRoot, ".worktrees", "node-a");

    const result = ensureNodeWorktree(
      repoRoot,
      path,
      "0000000000000000000000000000000000000000",
      "graph/demo/node-a",
    );

    expect(isErr(result)).toBe(true);
  });
});

describe("uncommittedPaths", () => {
  it("is empty for a clean tree", () => {
    const repoRoot = fixtureRepo();
    expect(unwrap(uncommittedPaths(repoRoot))).toEqual([]);
  });

  it("names a modified, a new untracked and a staged path", () => {
    const repoRoot = fixtureRepo();
    writeFileSync(join(repoRoot, "root.txt"), "changed\n");
    writeFileSync(join(repoRoot, "new-file.txt"), "new\n");
    execFileSync("git", ["add", "new-file.txt"], { cwd: repoRoot });

    const paths = [...unwrap(uncommittedPaths(repoRoot))].sort();
    expect(paths).toEqual(["new-file.txt", "root.txt"]);
  });
});

describe("commitBriefIfChanged", () => {
  it("commits exactly the brief path with the runner's subject, body and footer", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    unwrap(ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a"));

    writeFileSync(join(path, "root.txt"), "brief content\n");
    const result = commitBriefIfChanged(
      path,
      "root.txt",
      "node-a",
      "session-1",
    );

    expect(isOk(result)).toBe(true);
    const shortSha = unwrap(result);
    expect(shortSha).toBeDefined();
    expect(headSha(path)).toContain(shortSha ?? "");
    expect(unwrap(uncommittedPaths(path))).toEqual([]);

    const log = execFileSync("git", ["log", "-1", "--pretty=%B"], {
      cwd: path,
      encoding: "utf-8",
    });
    expect(log).toContain("chore(node-a): write the session brief");
    expect(log).toContain("session-1");
    expect(log).toContain(
      "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>",
    );

    const changed = execFileSync(
      "git",
      ["show", "--name-only", "--pretty=", "HEAD"],
      { cwd: path, encoding: "utf-8" },
    ).trim();
    expect(changed).toBe("root.txt");
  });

  it("leaves an unrelated staged file and an unstaged edit exactly as they were", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    unwrap(ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a"));

    writeFileSync(
      join(path, "staged-earlier.txt"),
      "left by an earlier session\n",
    );
    execFileSync("git", ["add", "staged-earlier.txt"], { cwd: path });
    writeFileSync(join(path, "root.txt"), "unstaged edit\n");
    writeFileSync(join(path, "brief.md"), "brief content\n");
    execFileSync("git", ["add", "brief.md"], { cwd: path });

    const result = commitBriefIfChanged(
      path,
      "brief.md",
      "node-a",
      "session-1",
    );

    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBeDefined();

    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: path,
      encoding: "utf-8",
    });
    expect(status).toContain("staged-earlier.txt");
    expect(status).toContain("root.txt");

    const changed = execFileSync(
      "git",
      ["show", "--name-only", "--pretty=", "HEAD"],
      { cwd: path, encoding: "utf-8" },
    ).trim();
    expect(changed).toBe("brief.md");
  });

  it("commits nothing and reports no sha when the path already matches HEAD", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    unwrap(ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a"));

    const result = commitBriefIfChanged(
      path,
      "root.txt",
      "node-a",
      "session-1",
    );

    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBeUndefined();
    expect(headSha(path)).toBe(sha);
  });
});
