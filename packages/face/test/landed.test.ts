import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  derivation,
  duration,
  fold,
  type LedgerEvent,
  type Receipt,
  sessionRuntime,
  spend,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import type { GraphDocument } from "../src/document.ts";
import { type ClearedHead, clearedHeadOf, landedOf, mainLineReader } from "../src/landed.ts";
import { positionOf } from "../src/position.ts";

const runsRoot = join(import.meta.dirname, ".runs");
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: join(repo, "..", "no-global-gitconfig"),
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_AUTHOR_NAME: "Fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "Fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    },
  }).trim();
}

function repository(main = "main"): string {
  mkdirSync(runsRoot, { recursive: true });
  directory = mkdtempSync(join(runsRoot, "landed-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  git(repo, "init", "--quiet", "--initial-branch", main);
  commit(repo, "README", "fixture\n", "chore: start the fixture");
  return repo;
}

function commit(repo: string, path: string, content: string, message: string): string {
  const file = join(repo, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  git(repo, "add", path);
  git(repo, "commit", "--quiet", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

interface Attempt {
  readonly base: string;
  readonly head: string;
}

function twoCommitBranch(repo: string, branch = "graph/demo/a"): Attempt {
  const base = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "--quiet", "-c", branch);
  commit(repo, "src/a.ts", "export const a = 1;\n", "feat: first half");
  const head = commit(repo, "src/b.ts", "export const b = 2;\n", "feat: second half");
  git(repo, "switch", "--quiet", "main");
  return { base, head };
}

function unrelatedOnMain(repo: string): void {
  commit(repo, "docs/other.md", "someone else's work\n", "docs: unrelated work on main");
}

function known(attempt: Attempt): ClearedHead {
  return { kind: "known", head: attempt.head, base: attempt.base };
}

function readOnlySnapshot(repo: string): string {
  return [
    git(repo, "for-each-ref", "--format=%(refname) %(objectname)"),
    git(repo, "status", "--porcelain=v1", "--untracked-files=all"),
    git(repo, "count-objects"),
  ].join("\n");
}

describe("landed: on-main", () => {
  it("reads a merged branch's cleared head as on-main by ancestry", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "ancestry",
    });
  });

  it("reads a two-commit branch squashed into one commit on main as on-main by squash", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "squash",
    });
  });

  it("reads a branch whose commits were each cherry-picked onto main as on-main by patch", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "cherry-pick", `${attempt.base}..${attempt.head}`);
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "patch",
    });
  });

  it("finds main through the branch origin's HEAD names before main or master", () => {
    const repo = repository("trunk");
    git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on trunk");
    expect(landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "on-main",
      main: "trunk",
      head,
      by: "ancestry",
    });
  });

  it("falls back to master when origin names nothing and main does not exist", () => {
    const repo = repository("master");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on master");
    const landed = landedOf(repo, { kind: "known", head, base });
    expect(landed).toMatchObject({ kind: "on-main", main: "master" });
  });
});

describe("landed: not-on-main", () => {
  it("reads a branch nobody merged as not-on-main", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "not-on-main",
      main: "main",
      head: attempt.head,
    });
  });
});

describe("landed: reverted-on-main", () => {
  it("reads a squash that main reverts with git's own trailer as reverted-on-main", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    git(repo, "revert", "--no-edit", "HEAD");
    const revert = git(repo, "rev-parse", "HEAD");
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: revert,
    });
  });

  it("reads a fast-forwarded commit that main reverts as reverted-on-main", () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: one commit");
    git(repo, "revert", "--no-edit", "HEAD");
    expect(landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head,
      revertedBy: git(repo, "rev-parse", "HEAD"),
    });
  });

  it("reads a merge whose revert names only the merge commit as reverted-on-main by its patch", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    git(repo, "revert", "--no-edit", "-m", "1", "HEAD");
    expect(landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: git(repo, "rev-parse", "HEAD"),
    });
  });

  it("reads a reverted revert as unknown rather than guessing which one stands", () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: one commit");
    git(repo, "revert", "--no-edit", "HEAD");
    git(repo, "revert", "--no-edit", "HEAD");
    const landed = landedOf(repo, { kind: "known", head, base });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({ because: expect.stringContaining("reverts that revert") });
  });
});

describe("landed: unknown, with a because", () => {
  it("says no main branch when origin names none and neither main nor master exists", () => {
    const repo = repository("trunk");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on trunk");
    expect(landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "unknown",
      because:
        "no main branch: origin's HEAD names no local branch, and neither main nor master exists",
    });
  });

  it("says the branch is gone when the cleared head is no longer in the repository", () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const gone = "0123456789abcdef0123456789abcdef01234567";
    expect(landedOf(repo, { kind: "known", head: gone, base })).toEqual({
      kind: "unknown",
      because: "the cleared head 0123456789ab is gone from the repository; its branch is gone",
    });
  });

  it("says git refused when the directory is not a repository", () => {
    const repo = repository();
    const outside = join(repo, "..");
    const landed = landedOf(outside, { kind: "known", head: "abc", base: "def" });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({ because: expect.stringMatching(/^git refused/) });
  });

  it("refuses to guess when the attempt recorded no base", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    expect(landedOf(repo, { kind: "known", head: attempt.head, base: undefined })).toEqual({
      kind: "unknown",
      because: "the attempt recorded no base commit, so its change cannot be compared with main",
    });
  });

  it("refuses to guess when only some of the attempt's commits reached main", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    const first = git(repo, "rev-parse", `${attempt.head}~1`);
    git(repo, "cherry-pick", first);
    const landed = landedOf(repo, known(attempt));
    expect(landed).toEqual({
      kind: "unknown",
      because:
        "1 of the attempt's 2 commits are on main and the rest are not, and its whole change matches no single commit there",
    });
  });

  it("reads nothing but git: refs, index and objects are unchanged by a read", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    const before = readOnlySnapshot(repo);
    landedOf(repo, known(attempt));
    expect(readOnlySnapshot(repo)).toBe(before);
  });
});

function receipt(gateId: string, commitSha: string, by: "gate" | "human" = "gate"): Receipt {
  return {
    id: `receipt-${gateId}`,
    gate: gateId,
    commitSha,
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: by === "gate" ? derivation.gate(gateId, "1", "runner") : derivation.human("Person"),
    proof: {},
  };
}

describe("clearedHeadOf", () => {
  it("takes the commit the runner's receipts judged, ignoring a person's receipt", () => {
    expect(
      clearedHeadOf(
        { kind: "cleared", receipts: [receipt("test", "aaa"), receipt("ok", "bbb", "human")] },
        "base",
      ),
    ).toEqual({ kind: "known", head: "aaa", base: "base" });
  });

  it("is unknown when the runner's receipts name more than one commit", () => {
    const head = clearedHeadOf(
      { kind: "cleared", receipts: [receipt("test", "aaa"), receipt("lint", "bbb")] },
      "base",
    );
    expect(head.kind).toBe("unknown");
  });

  it("is unknown when no runner receipt cleared the node", () => {
    expect(clearedHeadOf({ kind: "cleared", receipts: [] }, "base").kind).toBe("unknown");
  });
});

const document: GraphDocument = {
  id: "demo",
  gates: [],
  nodes: [
    { id: "a", dependsOn: [], gates: [{ id: "test", kind: "command" }] },
    { id: "b", dependsOn: ["a"], gates: [] },
  ],
};

function clearedBy(id: string, attempt: Attempt): readonly LedgerEvent[] {
  const node = { graph: "demo", id };
  const session = `s-${id}`;
  return [
    {
      kind: "session-started",
      session: { id: session, node, runtime: sessionRuntime.declared("luna", "claude", undefined) },
      brief: { graph: "demo", node: id, role: "worker", acceptance: "x", gates: [], scope: [] },
      graphBaseSha: attempt.base,
    },
    { kind: "lease-taken", node, session, expiry: Date.now() + 60_000 },
    {
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [receipt("test", attempt.head)] },
    },
  ];
}

function clearedA(attempt: Attempt, alsoB = false): readonly LedgerEvent[] {
  return [
    { kind: "node-created", node: { graph: "demo", id: "demo" } },
    { kind: "node-created", node: { graph: "demo", id: "a" } },
    { kind: "node-created", node: { graph: "demo", id: "b" } },
    ...clearedBy("a", attempt),
    ...(alsoB ? clearedBy("b", attempt) : []),
  ];
}

describe("positionOf with the main line", () => {
  it("carries landed only on a cleared node, read from the attempt that cleared it", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");

    const position = positionOf(
      document,
      fold([...clearedA(attempt)]),
      "h",
      Date.now(),
      undefined,
      mainLineReader(repo),
    );
    const [a, b] = position.nodes;
    expect(a?.landed).toEqual({ kind: "on-main", main: "main", head: attempt.head, by: "squash" });
    expect(b !== undefined && "landed" in b).toBe(false);
    expect(position.done).toBe(false);
  });

  it("is done when every node is cleared and on-main, and not done when one is not on main", () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    const notMerged = positionOf(
      document,
      fold([...clearedA(attempt, true)]),
      "h",
      Date.now(),
      undefined,
      mainLineReader(repo),
    );
    expect(notMerged.done).toBe(false);

    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    const merged = positionOf(
      document,
      fold([...clearedA(attempt, true)]),
      "h",
      Date.now(),
      undefined,
      mainLineReader(repo),
    );
    expect(merged.nodes.map((node) => node.landed?.kind)).toEqual(["on-main", "on-main"]);
    expect(merged.done).toBe(true);
  });

  it("says landed is unknown when the read was given no repository, and is never done", () => {
    const attempt = { base: "base", head: "head" };
    const position = positionOf(document, fold([...clearedA(attempt, true)]), "h", Date.now());
    expect(position.nodes[0]?.landed).toEqual({
      kind: "unknown",
      because: "this read was given no repository to read main from",
    });
    expect(position.done).toBe(false);
  });
});
