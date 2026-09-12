import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sharedJournalDirectory } from "../src/root.ts";

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
  execFileSync("git", args, { cwd, env: gitEnv });
}

describe("sharedJournalDirectory", () => {
  it("resolves the same path from every worktree of one repository", () => {
    directory = mkdtempSync(join(runsRoot, "repo-"));
    git(["-c", "init.defaultBranch=main", "init", "--quiet"], directory);
    git(
      ["-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "root"],
      directory,
    );

    const worktree = join(directory, "second-worktree");
    git(["worktree", "add", "--quiet", "-b", "second", worktree], directory);

    const fromMainWorktree = sharedJournalDirectory(directory);
    const fromSecondWorktree = sharedJournalDirectory(worktree);

    expect(fromSecondWorktree).toBe(fromMainWorktree);
    expect(fromMainWorktree).toBe(join(directory, ".interlock", "ledger"));
  });
});
