import { execFileSync } from "node:child_process";

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
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], {
    cwd: directory,
  });
  commitAll(directory, "fixture root");
}

export function commitAll(directory: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: directory });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message], {
    cwd: directory,
    env: GIT_ENV,
  });
}

export function headSha(directory: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: directory,
    encoding: "utf-8",
  }).trim();
}
