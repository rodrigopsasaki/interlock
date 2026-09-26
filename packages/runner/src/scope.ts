import { execFileSync } from "node:child_process";

// Node's execFileSync default (1 MB) truncates the file list of a real, large repository.
const GIT_MAX_BUFFER_BYTES = 512 * 1024 * 1024;

export function gitTrackedFiles(root: string): readonly string[] {
  return execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf-8",
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  })
    .split("\n")
    .filter((path) => path.length > 0);
}
