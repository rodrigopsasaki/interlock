import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  type ClearedHead,
  type FaceKey,
  LANDED_CACHE_VERSION,
  type Landed,
  landedCachePath,
  mainLineReader,
} from "face";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../../test/support/gitFixture.ts";
import { runInterlockFace } from "../../src/face/run.ts";
import { runInterlockPosition } from "../../src/position.ts";
import {
  type ClearedNode,
  countingGit,
  countsOf,
  git,
  judgedHeads,
  type LandedRepository,
  landedRepository,
  moveMain,
  withNewBase,
  withNewHead,
  writeLandedJournal,
} from "./landedFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
const bin = resolve(import.meta.dirname, "..", "..", "src", "bin.ts");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): LandedRepository {
  const repository = landedRepository(runsRoot, { alpha: ["a1", "a2"], beta: ["b1", "b2"] });
  roots.push(repository.root);
  return repository;
}

function headsOf(cleared: readonly ClearedNode[]): readonly ClearedHead[] {
  return cleared.map((node) => ({ kind: "known", head: node.head, base: node.base }));
}

function key(name: string): FaceKey {
  return name === "enter" ? { name: "enter" } : { name: "char", char: name };
}

function screen(): { write(text: string): boolean; on(): void; off(): void } {
  return { write: () => true, on() {}, off() {} };
}

interface CacheFile {
  readonly version: unknown;
  readonly entries: readonly Readonly<Record<string, unknown>>[];
}

function cacheFileOf(root: string): CacheFile {
  const parsed: unknown = JSON.parse(readFileSync(landedCachePath(root), "utf-8"));
  if (typeof parsed !== "object" || parsed === null || !("entries" in parsed)) {
    throw new Error("the cache file has no entries");
  }
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  return {
    version: "version" in parsed ? parsed.version : undefined,
    entries: entries.filter(
      (entry): entry is Readonly<Record<string, unknown>> =>
        typeof entry === "object" && entry !== null,
    ),
  };
}

function cachedHeads(root: string): readonly unknown[] {
  return cacheFileOf(root).entries.map((entry) => entry["head"]);
}

function rewriteCache(root: string, change: (file: CacheFile) => unknown): void {
  writeFileSync(landedCachePath(root), JSON.stringify(change(cacheFileOf(root))));
}

function onMainByAncestry(head: string): Landed {
  return { kind: "on-main", main: "main", head, by: "ancestry" };
}

async function warm(repository: LandedRepository): Promise<void> {
  await mainLineReader(repository.root).read(headsOf(repository.cleared));
}

async function freshReadCounts(repository: LandedRepository, heads = headsOf(repository.cleared)) {
  const counter = countingGit();
  const reader = await mainLineReader(repository.root, { git: counter.run }).read(heads);
  return { counts: countsOf(counter.calls), landed: heads.map(reader) };
}

describe("landed cache: world refreshes through the face lifecycle", () => {
  it("reads main once per refresh, judges only what moved, retries a failed key and never reads for a screen-only redraw", async () => {
    const repository = fixture();
    const { root } = repository;
    const rootSha = git(root, "rev-list", "--max-parents=0", "HEAD");
    const counter = countingGit();
    let cleared = [...repository.cleared];
    const drain = () => countsOf(counter.calls.splice(0));
    const drainHeads = () => {
      const heads = judgedHeads(counter.calls);
      counter.calls.splice(0);
      return heads;
    };

    async function* lifecycle(): AsyncIterable<FaceKey> {
      expect(drain()).toMatchObject({ snapshots: 1, judgments: 4 });

      yield key("r");
      expect(drain()).toEqual({ snapshots: 1, perNode: 0, judgments: 0 });

      yield key("?");
      expect(drain()).toEqual({ snapshots: 0, perNode: 0, judgments: 0 });
      yield key("?");
      expect(drain()).toEqual({ snapshots: 0, perNode: 0, judgments: 0 });

      const [first] = cleared;
      if (first === undefined) throw new Error("expected a cleared node");
      const rerun = withNewHead(root, first);
      cleared = [rerun, ...cleared.slice(1)];
      writeLandedJournal(root, cleared);
      yield key("r");
      expect(countsOf(counter.calls)).toMatchObject({ snapshots: 1, judgments: 1 });
      expect(drainHeads()).toEqual([rerun.head]);

      const [, , , last] = cleared;
      if (last === undefined) throw new Error("expected four cleared nodes");
      const rebased = withNewBase(last, rootSha);
      cleared = [...cleared.slice(0, 3), rebased];
      writeLandedJournal(root, cleared);
      yield key("r");
      expect(countsOf(counter.calls)).toMatchObject({ snapshots: 1, judgments: 1 });
      expect(drainHeads()).toEqual([rebased.head]);

      moveMain(root);
      yield key("r");
      expect(drain()).toMatchObject({ snapshots: 1, judgments: 4 });

      const [, flaky] = cleared;
      if (flaky === undefined) throw new Error("expected a second cleared node");
      moveMain(root, "docs/again.md");
      counter.failNext(
        (call) => call.args[0] === "cat-file" && (call.input ?? "").startsWith(flaky.head),
      );
      yield key("r");
      expect(drain()).toMatchObject({ snapshots: 1, judgments: 4 });
      expect(cachedHeads(root)).not.toContain(flaky.head);

      yield key("r");
      expect(countsOf(counter.calls)).toMatchObject({ snapshots: 1, judgments: 1 });
      expect(drainHeads()).toEqual([flaky.head]);

      yield key("r");
      expect(drain()).toEqual({ snapshots: 1, perNode: 0, judgments: 0 });
      expect(cachedHeads(root)).toContain(flaky.head);

      yield key("q");
    }

    const result = await runInterlockFace([], {
      cwd: root,
      stdout: screen(),
      git: counter.run,
      keys: lifecycle(),
    });
    expect(result.exitCode).toBe(0);
  });
});

describe("landed cache: across processes, on disk", () => {
  it("serves a judgment made by another process without a per-node read", async () => {
    const repository = fixture();
    execFileSync(process.execPath, [bin, "position", "--json", "--repo", repository.root], {
      cwd: repository.root,
      encoding: "utf-8",
    });
    expect(cacheFileOf(repository.root).version).toBe(LANDED_CACHE_VERSION);
    const { counts, landed } = await freshReadCounts(repository);
    expect(counts).toEqual({ snapshots: 1, perNode: 0, judgments: 0 });
    expect(landed).toEqual(repository.cleared.map((node) => onMainByAncestry(node.head)));
  });

  it("keeps its cache under a folder that ignores itself, so a repository it reads never needs an ignore line", async () => {
    const repository = fixture();
    await warm(repository);
    expect(landedCachePath(repository.root)).toBe(
      join(repository.root, ".interlock", ".cache", "landed-cache.json"),
    );
    expect(
      readFileSync(join(dirname(landedCachePath(repository.root)), ".gitignore"), "utf-8"),
    ).toBe("*\n");
    const status = fixtureGit(["status", "--porcelain", "--untracked-files=all"], {
      cwd: repository.root,
    });
    expect(status.split("\n").filter((line) => line.includes(".interlock/.cache"))).toEqual([]);
  });

  it("ignores a corrupt cache and rebuilds it", async () => {
    const repository = fixture();
    mkdirSync(dirname(landedCachePath(repository.root)), { recursive: true });
    writeFileSync(landedCachePath(repository.root), "{ not json");
    expect((await freshReadCounts(repository)).counts.judgments).toBe(4);
    expect(cacheFileOf(repository.root).entries).toHaveLength(4);
    expect((await freshReadCounts(repository)).counts.judgments).toBe(0);
  });

  it("ignores a cache written under another version and rebuilds it", async () => {
    const repository = fixture();
    await warm(repository);
    rewriteCache(repository.root, (file) => ({ ...file, version: "landed-cache@0" }));
    expect((await freshReadCounts(repository)).counts.judgments).toBe(4);
    expect(cacheFileOf(repository.root).version).toBe(LANDED_CACHE_VERSION);
    expect((await freshReadCounts(repository)).counts.judgments).toBe(0);
  });

  const otherSha = "0123456789abcdef0123456789abcdef01234567";
  const changes: readonly [string, (entry: Readonly<Record<string, unknown>>) => unknown][] = [
    ["main SHA", (entry) => ({ ...entry, mainSha: otherSha })],
    ["cleared head SHA", (entry) => ({ ...entry, head: otherSha, landed: entry["landed"] })],
    ["recorded base SHA", (entry) => ({ ...entry, base: { kind: "recorded", sha: otherSha } })],
    ["base, made absent", (entry) => ({ ...entry, base: { kind: "absent" } })],
  ];
  for (const [component, change] of changes) {
    it(`misses when the ${component} of a stored key differs from the asked key`, async () => {
      const repository = fixture();
      await warm(repository);
      rewriteCache(repository.root, (file) => ({ ...file, entries: file.entries.map(change) }));
      expect((await freshReadCounts(repository)).counts.judgments).toBe(4);
    });
  }

  it("never caches a judgment from a failed git read, in memory or on disk", async () => {
    const repository = fixture();
    const [failing] = repository.cleared;
    if (failing === undefined) throw new Error("expected a cleared node");
    const counter = countingGit();
    const reader = mainLineReader(repository.root, { git: counter.run });
    counter.failNext(
      (call) => call.args[0] === "cat-file" && (call.input ?? "").startsWith(failing.head),
    );
    const first = await reader.read(headsOf(repository.cleared));
    expect(first({ kind: "known", head: failing.head, base: failing.base })).toMatchObject({
      kind: "unknown",
      because: expect.stringMatching(/^git refused/),
    });
    expect(cachedHeads(repository.root)).not.toContain(failing.head);
    counter.calls.splice(0);
    await reader.read(headsOf(repository.cleared));
    expect(judgedHeads(counter.calls)).toEqual([failing.head]);
  });

  it("never caches a judgment from an unavailable head or base", async () => {
    const repository = fixture();
    const gone = "fedcba9876543210fedcba9876543210fedcba98";
    const [present] = repository.cleared;
    if (present === undefined) throw new Error("expected a cleared node");
    const unavailable: readonly ClearedHead[] = [
      { kind: "known", head: gone, base: present.base },
      { kind: "known", head: present.head, base: gone },
    ];
    const counter = countingGit();
    const reader = mainLineReader(repository.root, { git: counter.run });
    const first = await reader.read([...headsOf(repository.cleared), ...unavailable]);
    expect(unavailable.map(first).map((landed) => landed.kind)).toEqual(["unknown", "unknown"]);
    expect(cacheFileOf(repository.root).entries).toHaveLength(4);
    counter.calls.splice(0);
    await reader.read([...headsOf(repository.cleared), ...unavailable]);
    expect(countsOf(counter.calls).judgments).toBe(2);
  });

  it("answers the position read when the cache cannot be written", async () => {
    const repository = fixture();
    mkdirSync(landedCachePath(repository.root), { recursive: true });
    const result = await runInterlockPosition(["--json", "--repo", repository.root], {
      cwd: repository.root,
    });
    expect(result.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(result.message);
    expect(parsed).toMatchObject({
      repositories: [
        {
          state: "found",
          graphs: [
            {
              state: "read",
              position: {
                nodes: repository.cleared
                  .slice(0, 2)
                  .map((node) => ({ landed: onMainByAncestry(node.head) })),
              },
            },
            { state: "read" },
          ],
        },
      ],
    });
    expect(
      readdirSync(dirname(landedCachePath(repository.root))).filter((name) =>
        name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });
});
