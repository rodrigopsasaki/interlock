import { execFileSync } from "node:child_process";

export interface HunkRange {
  readonly start: number;
  readonly end: number;
}

export interface FileDiff {
  readonly path: string;
  readonly hunks: readonly HunkRange[];
  readonly addedLines: readonly string[];
}

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8" });
}

export function isCommit(repoRoot: string, sha: string): boolean {
  try {
    return git(["cat-file", "-t", sha], repoRoot).trim() === "commit";
  } catch {
    return false;
  }
}

export function isAncestor(
  repoRoot: string,
  ancestor: string,
  descendant: string,
): boolean {
  try {
    git(["merge-base", "--is-ancestor", ancestor, descendant], repoRoot);
    return true;
  } catch {
    return false;
  }
}

export function pathExistsAt(
  repoRoot: string,
  sha: string,
  path: string,
): boolean {
  try {
    git(["cat-file", "-e", `${sha}:${path}`], repoRoot);
    return true;
  } catch {
    return false;
  }
}

export function fileContentAt(
  repoRoot: string,
  sha: string,
  path: string,
): string | undefined {
  try {
    return git(["show", `${sha}:${path}`], repoRoot);
  } catch {
    return undefined;
  }
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;

function stripPrefix(raw: string, prefix: string): string | undefined {
  return raw === "/dev/null"
    ? undefined
    : raw.replace(new RegExp(`^${prefix}`), "");
}

// A no-context diff of the whole range, parsed once into one entry per changed path: the
// path itself, the new-file line ranges of every hunk that added at least one line, and the
// raw text of every added line. A rename with no content change shows as a delete plus an
// add under plain `git diff` (no -M requested), which is exactly the two changed paths the
// inverse check and the hunk citations both want.
export function diffFiles(
  repoRoot: string,
  from: string,
  to: string,
): readonly FileDiff[] {
  const output = git(["diff", "-U0", `${from}..${to}`], repoRoot);
  const files: FileDiff[] = [];
  let path: string | undefined;
  let minusPath: string | undefined;
  let hunks: HunkRange[] = [];
  let addedLines: string[] = [];

  const flush = (): void => {
    if (path !== undefined) files.push({ path, hunks, addedLines });
    path = undefined;
    minusPath = undefined;
    hunks = [];
    addedLines = [];
  };

  for (const line of output.split("\n")) {
    if (line.startsWith("diff --git ")) {
      flush();
      continue;
    }
    if (line.startsWith("--- ")) {
      minusPath = stripPrefix(line.slice(4).trim(), "a/");
      continue;
    }
    if (line.startsWith("+++ ")) {
      const plusPath = stripPrefix(line.slice(4).trim(), "b/");
      path = plusPath ?? minusPath;
      continue;
    }
    const header = HUNK_HEADER.exec(line);
    if (header !== null) {
      const start = Number(header[1]);
      const count = header[2] === undefined ? 1 : Number(header[2]);
      if (count > 0) hunks.push({ start, end: start + count - 1 });
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      addedLines.push(line.slice(1));
    }
  }
  flush();
  return files;
}
