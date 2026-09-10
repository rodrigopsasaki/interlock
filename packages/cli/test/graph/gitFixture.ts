import { execFileSync } from "node:child_process";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

// A fixture directory without its own `.git` would resolve to the real repository's journal.
export function gitInitFixture(directory: string): void {
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], {
    cwd: directory,
  });
  execFileSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "fixture root",
    ],
    { cwd: directory, env: GIT_ENV },
  );
}

// A worktree checkout needs real, committed content: stages and commits whatever is on disk.
export function commitAll(directory: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: directory });
  execFileSync(
    "git",
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message],
    { cwd: directory, env: GIT_ENV },
  );
}
