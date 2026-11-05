import { fixtureGit, initFixtureRepository } from "../../../../test/support/gitFixture.ts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

// A fixture directory without its own `.git` would resolve to the real repository's journal.
export function gitInitFixture(directory: string): void {
  initFixtureRepository(directory, { defaultBranch: "main" });
  fixtureGit(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "--allow-empty", "-m", "fixture root"],
    { cwd: directory, env: GIT_ENV },
  );
}

// A worktree checkout needs real, committed content: stages and commits whatever is on disk.
export function commitAll(directory: string, message: string): void {
  fixtureGit(["add", "-A"], { cwd: directory });
  fixtureGit(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message], {
    cwd: directory,
    env: GIT_ENV,
  });
}

// Commits one path only, leaving every other uncommitted path in the tree untouched: a fixture
// that wants to say "this one file is settled, everything else is still dirty" needs this rather
// than commitAll's git add -A.
export function commitPath(directory: string, relativePath: string, message: string): void {
  fixtureGit(["add", "--", relativePath], { cwd: directory });
  fixtureGit(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message, "--", relativePath],
    { cwd: directory, env: GIT_ENV },
  );
}
