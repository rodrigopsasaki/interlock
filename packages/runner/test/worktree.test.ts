import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { ensureNodeWorktree, explainWorktreeRefusal } from "../src/worktree.ts";
import {
  commitAll,
  gitInitFixtureWithContent,
  headSha,
} from "./support/gitFixture.ts";

// Its own directory, not the shared "test/.runs" other files in this package also use: those
// files' own hooks recursively wipe that directory between tests, racing this file's fixtures
// when vitest runs test files concurrently.
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
  });

  it("is idempotent: asking for the base it is already on changes nothing", () => {
    const repoRoot = fixtureRepo();
    const sha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a");

    const result = ensureNodeWorktree(repoRoot, path, sha, "graph/demo/node-a");

    expect(isOk(result)).toBe(true);
    expect(headSha(path)).toBe(sha);
  });

  it("resets an existing worktree to a later base when its branch carries no commits of its own", () => {
    const repoRoot = fixtureRepo();
    const firstSha = headSha(repoRoot);
    const path = join(repoRoot, ".worktrees", "node-a");
    const branch = "graph/demo/node-a";
    const created = ensureNodeWorktree(repoRoot, path, firstSha, branch);
    expect(isOk(created)).toBe(true);

    // A merge lands on the repository's main line after the worktree was created; nothing was
    // ever committed inside the worktree itself, so its branch is still exactly at `firstSha`.
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

    // A session commits real work inside the worktree, diverging its branch from the base it
    // started on.
    writeFileSync(join(path, "session-work.txt"), "the agent's own work\n");
    commitAll(path, "session work");
    const sessionSha = headSha(path);

    // Meanwhile the repository's main line moves on independently.
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

    // Nothing discarded: the session's own commit and file are still exactly where they were.
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
