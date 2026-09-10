import { execFileSync } from "node:child_process";

// receiptId hashes exactly the paths it is given, never a directory; a node has no narrower
// scope declared anywhere in the graph format yet, so every gate receipt is addressed to the
// full set of files git tracks at the scope root, the one honest answer this format supports.
export function gitTrackedFiles(root: string): readonly string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf-8" })
    .split("\n")
    .filter((path) => path.length > 0);
}
