import { execFileSync } from "node:child_process";

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

// journalDirectory now resolves via `git rev-parse --git-common-dir`. A fixture directory with
// no `.git` of its own is not a repository boundary, so that resolution walks up and finds this
// worktree's real repository instead -- git-initing the fixture keeps its journal writes inside
// itself, the same way the fixture's own `.interlock/graphs` stays inside it.
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
