import { fixtureGit, initFixtureRepository } from "../../../../test/support/gitFixture.ts";

export const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export const COMMIT_ARGS = ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m"] as const;

export function gitInitFixture(directory: string): void {
  initFixtureRepository(directory, { defaultBranch: "main" });
}

// Commits whatever is already on disk under `directory`.
export function commitAll(directory: string, message: string): string {
  fixtureGit(["add", "-A"], { cwd: directory });
  fixtureGit([...COMMIT_ARGS, message], { cwd: directory, env: GIT_ENV });
  return headSha(directory);
}

export function headSha(directory: string): string {
  return fixtureGit(["rev-parse", "HEAD"], { cwd: directory }).trim();
}
