import { execFileSync } from "node:child_process";

export function gitTrackedFiles(root: string): readonly string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf-8" })
    .split("\n")
    .filter((path) => path.length > 0);
}
