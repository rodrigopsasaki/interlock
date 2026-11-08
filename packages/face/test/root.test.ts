import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit, initFixtureRepository } from "../../../test/support/gitFixture.ts";
import { findRepoRoot, sharedJournalDirectory } from "../src/root.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

function git(args: readonly string[], cwd: string): void {
  fixtureGit(args, { cwd, env: gitEnv });
}

describe("sharedJournalDirectory", () => {
  it("resolves the same path from every worktree of one repository", async () => {
    directory = mkdtempSync(join(runsRoot, "repo-"));
    initFixtureRepository(directory, { defaultBranch: "main", env: gitEnv });
    git(
      ["-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "root"],
      directory,
    );

    const worktree = join(directory, "second-worktree");
    git(["worktree", "add", "--quiet", "-b", "second", worktree], directory);

    const fromMainWorktree = await sharedJournalDirectory(directory);
    const fromSecondWorktree = await sharedJournalDirectory(worktree);

    expect(fromSecondWorktree).toBe(fromMainWorktree);
    expect(fromMainWorktree).toBe(join(directory, ".interlock", "ledger"));
  });

  it("refuses the main checkout and its linked worktree while the test guard is set", async () => {
    directory = mkdtempSync(join(runsRoot, "guard-"));
    initFixtureRepository(directory, { defaultBranch: "main", env: gitEnv });
    git(
      ["-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "root"],
      directory,
    );

    const worktree = join(directory, "second-worktree");
    git(["worktree", "add", "--quiet", "-b", "second", worktree], directory);
    mkdirSync(join(worktree, ".interlock"), { recursive: true });
    const missingInterlock = join(worktree, "nested");
    mkdirSync(missingInterlock, { recursive: true });
    const fixture = mkdtempSync(join(runsRoot, "guard-own-"));
    initFixtureRepository(fixture, { defaultBranch: "main", env: gitEnv });

    const previousForbiddenRoot = process.env["INTERLOCK_TEST_FORBIDDEN_ROOT"];
    process.env["INTERLOCK_TEST_FORBIDDEN_ROOT"] = directory;
    try {
      expect(() => findRepoRoot(missingInterlock)).toThrow(
        `test cwd "${missingInterlock}" reached forbidden repository path "${worktree}"`,
      );
      await expect(sharedJournalDirectory(worktree)).rejects.toThrow(
        `test cwd "${worktree}" reached forbidden repository path "${join(directory, ".interlock", "ledger")}"`,
      );
      expect(findRepoRoot(fixture)).toBe(fixture);
      await expect(sharedJournalDirectory(fixture)).resolves.toBe(
        join(fixture, ".interlock", "ledger"),
      );
    } finally {
      if (previousForbiddenRoot === undefined) delete process.env["INTERLOCK_TEST_FORBIDDEN_ROOT"];
      else process.env["INTERLOCK_TEST_FORBIDDEN_ROOT"] = previousForbiddenRoot;
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
