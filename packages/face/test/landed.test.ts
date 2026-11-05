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
import { fixtureGit, initFixtureRepository } from "../../../test/support/gitFixture.ts";
import type { GraphDocument } from "../src/document.ts";
import { type ClearedHead, clearedHeadOf, landedOf } from "../src/landed.ts";
import { mainLineReader } from "../src/mainLineReader.ts";
import { clearedHeadsOf, positionOf } from "../src/position.ts";

const runsRoot = join(import.meta.dirname, ".runs");
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function git(repo: string, ...args: string[]): string {
  return gitWith(repo, {}, args);
}

function gitEnv(repo: string, extra: Readonly<Record<string, string>>): NodeJS.ProcessEnv {
  return {
    ...extra,
    ...process.env,
    GIT_CONFIG_GLOBAL: join(repo, "..", "no-global-gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "Fixture",
    GIT_AUTHOR_EMAIL: "fixture@example.invalid",
    GIT_COMMITTER_NAME: "Fixture",
    GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    ...extra,
  };
}

function gitWith(
  repo: string,
  extra: Readonly<Record<string, string>>,
  args: readonly string[],
  input?: string,
): string {
  const piped = input === undefined ? {} : { input };
  return fixtureGit(args, { cwd: repo, env: gitEnv(repo, extra), ...piped }).trim();
}

function repository(main = "main"): string {
  mkdirSync(runsRoot, { recursive: true });
  directory = mkdtempSync(join(runsRoot, "landed-"));
  const repo = join(directory, "repo");
  mkdirSync(repo);
  initFixtureRepository(repo, { initArgs: ["--initial-branch", main], env: gitEnv(repo, {}) });
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

function remove(repo: string, path: string, message: string): string {
  git(repo, "rm", "--quiet", path);
  git(repo, "commit", "--quiet", "-m", message);
  return git(repo, "rev-parse", "HEAD");
}

function commitAt(repo: string, files: Readonly<Record<string, string>>, date: string): string {
  for (const [path, content] of Object.entries(files)) {
    const file = join(repo, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    git(repo, "add", path);
  }
  gitWith(repo, { GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date }, [
    "commit",
    "--quiet",
    "-m",
    `chore: touch ${Object.keys(files).join(", ")}`,
  ]);
  return git(repo, "rev-parse", "HEAD");
}

function patchIdOf(repo: string, patch: string): string {
  return gitWith(repo, {}, ["patch-id", "--stable"], patch).split(" ")[0] ?? "";
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

interface ThreeCommits extends Attempt {
  readonly commits: readonly [string, string, string];
}

function threeCommitBranch(repo: string, branch = "graph/demo/three"): ThreeCommits {
  const base = git(repo, "rev-parse", "HEAD");
  git(repo, "switch", "--quiet", "-c", branch);
  const first = commit(repo, "src/one.ts", "export const one = 1;\n", "feat: one");
  const second = commit(repo, "src/two.ts", "export const two = 2;\n", "feat: two");
  const third = commit(repo, "src/three.ts", "export const three = 3;\n", "feat: three");
  git(repo, "switch", "--quiet", "main");
  return { base, head: third, commits: [first, second, third] };
}

function fastForward(repo: string, attempt: Attempt): void {
  git(repo, "merge", "--quiet", "--ff-only", attempt.head);
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
  it("reads a merged branch's cleared head as on-main by ancestry", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "ancestry",
    });
  });

  it("reads a two-commit branch squashed into one commit on main as on-main by squash", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "squash",
    });
  });

  it("reads a branch whose commits were each cherry-picked onto main as on-main by patch", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "cherry-pick", `${attempt.base}..${attempt.head}`);
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "on-main",
      main: "main",
      head: attempt.head,
      by: "patch",
    });
  });

  it("finds main through the branch origin's HEAD names before main or master", async () => {
    const repo = repository("trunk");
    git(repo, "update-ref", "refs/remotes/origin/trunk", "HEAD");
    git(repo, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on trunk");
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "on-main",
      main: "trunk",
      head,
      by: "ancestry",
    });
  });

  it("falls back to master when origin names nothing and main does not exist", async () => {
    const repo = repository("master");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on master");
    const landed = await landedOf(repo, { kind: "known", head, base });
    expect(landed).toMatchObject({ kind: "on-main", main: "master" });
  });
});

describe("landed: not-on-main", () => {
  it("reads a branch nobody merged as not-on-main", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "not-on-main",
      main: "main",
      head: attempt.head,
    });
  });
});

describe("landed: reverted-on-main", () => {
  it("reads a squash that main reverts with git's own trailer as reverted-on-main", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    git(repo, "revert", "--no-edit", "HEAD");
    const revert = git(repo, "rev-parse", "HEAD");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: revert,
    });
  });

  it("reads a fast-forwarded commit that main reverts as reverted-on-main", async () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: one commit");
    git(repo, "revert", "--no-edit", "HEAD");
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head,
      revertedBy: git(repo, "rev-parse", "HEAD"),
    });
  });

  it("reads a merge whose revert names only the merge commit as reverted-on-main by its patch", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    git(repo, "revert", "--no-edit", "-m", "1", "HEAD");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: git(repo, "rev-parse", "HEAD"),
    });
  });

  it("reads a reverted revert as unknown rather than guessing which one stands", async () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: one commit");
    git(repo, "revert", "--no-edit", "HEAD");
    git(repo, "revert", "--no-edit", "HEAD");
    const landed = await landedOf(repo, { kind: "known", head, base });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({ because: expect.stringContaining("reverts that revert") });
  });
});

describe("landed: unknown, with a because", () => {
  it("says no main branch when origin names none and neither main nor master exists", async () => {
    const repo = repository("trunk");
    const base = git(repo, "rev-parse", "HEAD");
    const head = commit(repo, "src/a.ts", "export const a = 1;\n", "feat: on trunk");
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "unknown",
      because:
        "no main branch: origin's HEAD names no local branch, and neither main nor master exists",
    });
  });

  it("says the branch is gone when the cleared head is no longer in the repository", async () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    const gone = "0123456789abcdef0123456789abcdef01234567";
    expect(await landedOf(repo, { kind: "known", head: gone, base })).toEqual({
      kind: "unknown",
      because: "the cleared head 0123456789ab is gone from the repository; its branch is gone",
    });
  });

  it("says git refused when the directory is not a repository", async () => {
    const repo = repository();
    const outside = join(repo, "..");
    const landed = await landedOf(outside, { kind: "known", head: "abc", base: "def" });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({ because: expect.stringMatching(/^git refused/) });
  });

  it("refuses to guess when the attempt recorded no base", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    expect(await landedOf(repo, { kind: "known", head: attempt.head, base: undefined })).toEqual({
      kind: "unknown",
      because: "the attempt recorded no base commit, so its change cannot be compared with main",
    });
  });

  it("refuses to guess when only some of the attempt's commits reached main", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    const first = git(repo, "rev-parse", `${attempt.head}~1`);
    git(repo, "cherry-pick", first);
    const landed = await landedOf(repo, known(attempt));
    expect(landed).toEqual({
      kind: "unknown",
      because:
        "1 of the attempt's 2 commits are on main and the rest are not, and its whole change matches no single commit there",
    });
  });

  it("reads nothing but git: refs, index and objects are unchanged by a read", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");
    const before = readOnlySnapshot(repo);
    await landedOf(repo, known(attempt));
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
  it("takes the commit the runner's receipts judged, ignoring a person's receipt", async () => {
    expect(
      clearedHeadOf(
        { kind: "cleared", receipts: [receipt("test", "aaa"), receipt("ok", "bbb", "human")] },
        "base",
      ),
    ).toEqual({ kind: "known", head: "aaa", base: "base" });
  });

  it("is unknown when the runner's receipts name more than one commit", async () => {
    const head = clearedHeadOf(
      { kind: "cleared", receipts: [receipt("test", "aaa"), receipt("lint", "bbb")] },
      "base",
    );
    expect(head.kind).toBe("unknown");
  });

  it("is unknown when no runner receipt cleared the node", async () => {
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
  it("carries landed only on a cleared node, read from the attempt that cleared it", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/a");
    git(repo, "commit", "--quiet", "-m", "feat: both halves, squashed");

    const projection = fold([...clearedA(attempt)]);
    const position = positionOf(
      document,
      projection,
      "h",
      Date.now(),
      undefined,
      await mainLineReader(repo).read(clearedHeadsOf(document, projection)),
    );
    const [a, b] = position.nodes;
    expect(a?.landed).toEqual({ kind: "on-main", main: "main", head: attempt.head, by: "squash" });
    expect(b !== undefined && "landed" in b).toBe(false);
    expect(position.done).toBe(false);
  });

  it("is done when every node is cleared and on-main, and not done when one is not on main", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    const projection = fold([...clearedA(attempt, true)]);
    const reader = mainLineReader(repo);
    const notMerged = positionOf(
      document,
      projection,
      "h",
      Date.now(),
      undefined,
      await reader.read(clearedHeadsOf(document, projection)),
    );
    expect(notMerged.done).toBe(false);

    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge graph/demo/a", "graph/demo/a");
    const merged = positionOf(
      document,
      projection,
      "h",
      Date.now(),
      undefined,
      await reader.read(clearedHeadsOf(document, projection)),
    );
    expect(merged.nodes.map((node) => node.landed?.kind)).toEqual(["on-main", "on-main"]);
    expect(merged.done).toBe(true);
  });

  it("says landed is unknown when the read was given no repository, and is never done", async () => {
    const attempt = { base: "base", head: "head" };
    const position = positionOf(document, fold([...clearedA(attempt, true)]), "h", Date.now());
    expect(position.nodes[0]?.landed).toEqual({
      kind: "unknown",
      because: "this read was given no repository to read main from",
    });
    expect(position.done).toBe(false);
  });
});

describe("landed: partly-reverted-on-main", () => {
  it("reads one exact manual inverse without a revert line as one commit undone", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    fastForward(repo, attempt);
    const undo = remove(repo, "src/two.ts", "chore: take two back out");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "partly-reverted-on-main",
      main: "main",
      head: attempt.head,
      reverted: [attempt.commits[1]],
      revertedBy: { [attempt.commits[1]]: undo },
    });
  });

  it("reads a revert line naming the commit as its undo even when its patch is not the exact inverse", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    fastForward(repo, attempt);
    writeFileSync(join(repo, "src/one.ts"), "");
    git(repo, "add", "src/one.ts");
    git(
      repo,
      "commit",
      "--quiet",
      "-m",
      `Revert "feat: one"\n\nThis reverts commit ${attempt.commits[0]}.`,
    );
    const undo = git(repo, "rev-parse", "HEAD");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "partly-reverted-on-main",
      main: "main",
      head: attempt.head,
      reverted: [attempt.commits[0]],
      revertedBy: { [attempt.commits[0]]: undo },
    });
  });

  it("lists every undone commit in attempt order, each paired with its own undo", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    fastForward(repo, attempt);
    const undoThree = remove(repo, "src/three.ts", "chore: take three back out");
    const undoOne = remove(repo, "src/one.ts", "chore: take one back out");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "partly-reverted-on-main",
      main: "main",
      head: attempt.head,
      reverted: [attempt.commits[0], attempt.commits[2]],
      revertedBy: { [attempt.commits[0]]: undoOne, [attempt.commits[2]]: undoThree },
    });
  });

  it("reads three exact inverses in separate commits without revert lines as reverted-on-main by the last", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    fastForward(repo, attempt);
    remove(repo, "src/two.ts", "chore: take two back out");
    remove(repo, "src/one.ts", "chore: take one back out");
    const last = remove(repo, "src/three.ts", "chore: take three back out");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: last,
    });
  });

  it("maps a cherry-picked commit reverted by a line naming its main counterpart to the original attempt commit", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    unrelatedOnMain(repo);
    git(repo, "cherry-pick", `${attempt.base}..${attempt.head}`);
    const counterpart = git(repo, "rev-parse", "HEAD~1");
    expect(counterpart).not.toBe(attempt.commits[1]);
    git(repo, "revert", "--no-edit", counterpart);
    const undo = git(repo, "rev-parse", "HEAD");
    expect(git(repo, "log", "-1", "--format=%B")).toContain(`This reverts commit ${counterpart}`);
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "partly-reverted-on-main",
      main: "main",
      head: attempt.head,
      reverted: [attempt.commits[1]],
      revertedBy: { [attempt.commits[1]]: undo },
    });
  });
});

describe("landed: undo evidence that proves nothing reads unknown", () => {
  it("reads an inverse whose context changed as unresolved rather than claiming the rest stands", async () => {
    const repo = repository();
    commit(repo, "src/lines.txt", "1\n2\n3\n4\n5\n6\n7\n", "chore: lines");
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "graph/demo/context");
    const first = commit(repo, "src/one.ts", "export const one = 1;\n", "feat: one");
    const second = commit(repo, "src/lines.txt", "1\n2\n3\nfour\n5\n6\n7\n", "feat: four");
    git(repo, "switch", "--quiet", "main");
    git(repo, "merge", "--quiet", "--ff-only", second);
    remove(repo, "src/one.ts", "chore: take one back out");
    commit(repo, "src/lines.txt", "1\n2\nthree\nfour\n5\n6\n7\n", "chore: three");
    const changedContext = commit(
      repo,
      "src/lines.txt",
      "1\n2\nthree\n4\n5\n6\n7\n",
      "chore: four back",
    );
    expect(patchIdOf(repo, git(repo, "show", changedContext))).not.toBe(
      patchIdOf(repo, git(repo, "diff", second, `${second}^`)),
    );
    const landed = await landedOf(repo, { kind: "known", head: second, base });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({
      because: expect.stringContaining("so what still stands is unresolved"),
    });
    expect(first).not.toBe(second);
  });

  it("reads an inverse followed by the same change applied again as unknown", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    fastForward(repo, attempt);
    remove(repo, "src/two.ts", "chore: take two back out");
    const again = commit(repo, "src/two.ts", "export const two = 2;\n", "feat: two, again");
    const landed = await landedOf(repo, known(attempt));
    expect(landed).toEqual({
      kind: "unknown",
      because: expect.stringContaining(`but ${again.slice(0, 12)} applies it again`),
    });
  });

  it("does not count an inverse that main holds on a line not descending from the landing", async () => {
    const repo = repository();
    commit(repo, "src/value.txt", "A\n", "chore: value");
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "side");
    commit(repo, "src/value.txt", "B\n", "chore: side sets B");
    const sideInverse = commit(repo, "src/value.txt", "A\n", "chore: side sets A back");
    git(repo, "switch", "--quiet", "main");
    const head = commit(repo, "src/value.txt", "B\n", "feat: value is B");
    git(repo, "merge", "--quiet", "--no-ff", "-m", "Merge side", "side");
    expect(git(repo, "show", "main:src/value.txt")).toBe("B");
    expect(patchIdOf(repo, git(repo, "show", sideInverse))).toBe(
      patchIdOf(repo, git(repo, "diff", head, `${head}^`)),
    );
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "on-main",
      main: "main",
      head,
      by: "ancestry",
    });
  });

  it("reads a revert line naming one commit squashed into main as unknown, not the squash undone", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/three");
    git(repo, "commit", "--quiet", "-m", "feat: one, two and three, squashed");
    git(repo, "rm", "--quiet", "src/one.ts");
    git(
      repo,
      "commit",
      "--quiet",
      "-m",
      `Revert one\n\nThis reverts commit ${attempt.commits[0]}.`,
    );
    const landed = await landedOf(repo, known(attempt));
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({
      because: expect.stringContaining("does not prove the whole squash undone"),
    });
  });
});

describe("landed: a squash is one unit", () => {
  it("reads a squash undone by its whole inverse, with no revert line, as reverted-on-main", async () => {
    const repo = repository();
    const attempt = threeCommitBranch(repo);
    git(repo, "merge", "--quiet", "--squash", "graph/demo/three");
    git(repo, "commit", "--quiet", "-m", "feat: one, two and three, squashed");
    git(repo, "rm", "--quiet", "src/one.ts", "src/two.ts", "src/three.ts");
    git(repo, "commit", "--quiet", "-m", "chore: take the squash back out");
    const undo = git(repo, "rev-parse", "HEAD");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "reverted-on-main",
      main: "main",
      head: attempt.head,
      revertedBy: undo,
    });
  });
});

describe("landed: an ambiguous squash reads unknown", () => {
  it("names a conflict-resolved squash whose patches match nothing as the closest candidate", async () => {
    const repo = repository();
    commit(repo, "src/shared.txt", "x\n", "chore: shared");
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "graph/demo/conflict");
    const first = commit(repo, "src/shared.txt", "attempt\n", "feat: attempt's shared");
    const head = commit(repo, "src/own.txt", "own\n", "feat: attempt's own");
    git(repo, "switch", "--quiet", "main");
    commit(repo, "src/shared.txt", "main\n", "chore: main's shared");
    expect(() => git(repo, "merge", "--squash", "graph/demo/conflict")).toThrow();
    writeFileSync(join(repo, "src/shared.txt"), "attempt and main\n");
    git(repo, "add", "src/shared.txt", "src/own.txt");
    git(repo, "commit", "--quiet", "-m", "feat: the attempt, squashed by hand");
    const squash = git(repo, "rev-parse", "HEAD");

    const squashId = patchIdOf(repo, git(repo, "show", squash));
    expect(squashId).not.toBe(patchIdOf(repo, git(repo, "diff", base, head)));
    expect(squashId).not.toBe(patchIdOf(repo, git(repo, "show", first)));
    expect(squashId).not.toBe(patchIdOf(repo, git(repo, "show", head)));

    const landed = await landedOf(repo, { kind: "known", head, base });
    expect(landed.kind).toBe("unknown");
    expect(landed).toMatchObject({
      because: expect.stringContaining(`the closest, ${squash}, shares 2 of its 2 paths`),
    });
  });

  it("reads a never-landed attempt followed by an unrelated edit to the same file as unknown", async () => {
    const repo = repository();
    commit(repo, "src/shared.txt", "top\n\n\n\n\n\n\nbottom\n", "chore: shared");
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "graph/demo/never");
    const head = commit(repo, "src/shared.txt", "TOP\n\n\n\n\n\n\nbottom\n", "feat: top");
    git(repo, "switch", "--quiet", "main");
    const elsewhere = commit(repo, "src/shared.txt", "top\n\n\n\n\n\n\nBOTTOM\n", "chore: bottom");
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "unknown",
      because: `no commit on main matches the attempt's commits or its whole change, but 1 commits there since its base touch paths it changed; the closest, ${elsewhere}, shares 1 of its 1 paths`,
    });
  });

  it("still reads not-on-main when no main commit since the base touches an attempt path", async () => {
    const repo = repository();
    const attempt = twoCommitBranch(repo);
    unrelatedOnMain(repo);
    commit(repo, "docs/more.md", "more\n", "docs: more unrelated work");
    expect(await landedOf(repo, known(attempt))).toEqual({
      kind: "not-on-main",
      main: "main",
      head: attempt.head,
    });
  });

  it("ranks candidates by shared paths, then earliest committer time, then full SHA", async () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "graph/demo/rank");
    commit(repo, "p/one.txt", "1\n", "feat: one");
    commit(repo, "p/two.txt", "2\n", "feat: two");
    const head = commit(repo, "p/three.txt", "3\n", "feat: three");
    git(repo, "switch", "--quiet", "main");
    commitAt(repo, { "p/one.txt": "main one\n" }, "2026-01-01T00:00:01Z");
    const later = commitAt(
      repo,
      { "p/two.txt": "main two\n", "p/three.txt": "main three\n" },
      "2026-01-01T00:00:09Z",
    );
    const earlier = commitAt(
      repo,
      { "p/one.txt": "main one again\n", "p/two.txt": "main two again\n" },
      "2026-01-01T00:00:05Z",
    );
    expect(later).not.toBe(earlier);
    expect(await landedOf(repo, { kind: "known", head, base })).toEqual({
      kind: "unknown",
      because: `no commit on main matches the attempt's commits or its whole change, but 3 commits there since its base touch paths it changed; the closest, ${earlier}, shares 2 of its 3 paths`,
    });
  });

  it("breaks a tie on shared paths and committer time by the lower full SHA", async () => {
    const repo = repository();
    const base = git(repo, "rev-parse", "HEAD");
    git(repo, "switch", "--quiet", "-c", "graph/demo/tie");
    commit(repo, "p/one.txt", "1\n", "feat: one");
    const head = commit(repo, "p/two.txt", "2\n", "feat: two");
    git(repo, "switch", "--quiet", "main");
    const at = "2026-01-01T00:00:03Z";
    const a = commitAt(repo, { "p/one.txt": "main one\n" }, at);
    const b = commitAt(repo, { "p/two.txt": "main two\n" }, at);
    const lower = a < b ? a : b;
    expect(await landedOf(repo, { kind: "known", head, base })).toMatchObject({
      kind: "unknown",
      because: expect.stringContaining(`the closest, ${lower}, shares 1 of its 2 paths`),
    });
  });
});
