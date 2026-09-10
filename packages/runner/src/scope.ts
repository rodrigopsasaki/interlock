import { execFileSync } from "node:child_process";

// No per-node scope is declared in the graph format yet, so receipts address every tracked file.
export function gitTrackedFiles(root: string): readonly string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf-8" })
    .split("\n")
    .filter((path) => path.length > 0);
}
