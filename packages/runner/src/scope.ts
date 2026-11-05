import { execFileSync } from "node:child_process";

const GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT = 512 * 1024 * 1024;

export function gitTrackedFiles(root: string): readonly string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: GIT_BUFFER_PAST_EXEC_FILE_SYNC_ONE_MEGABYTE_DEFAULT,
  })
    .split("\n")
    .filter((path) => path.length > 0);
}
