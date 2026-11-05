import { fixtureGit, initFixtureRepository } from "../../../../test/support/gitFixture.ts";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

// Commits whatever is already on disk under `directory`, so a fixture repository's own worktree
// checkouts and `git rev-parse main` resolve real, present content.
export function gitInitFixtureWithContent(directory: string): void {
  initFixtureRepository(directory, { defaultBranch: "main" });
  commitAll(directory, "fixture root");
}

export function commitAll(directory: string, message: string): void {
  fixtureGit(["add", "-A"], { cwd: directory });
  fixtureGit(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message], {
    cwd: directory,
    env: GIT_ENV,
  });
}

export function headSha(directory: string): string {
  return fixtureGit(["rev-parse", "HEAD"], { cwd: directory }).trim();
}
