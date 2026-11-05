import type { ChildProcess } from "node:child_process";
import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runInterlockPosition } from "../../cli/src/position.ts";
import { type LandedRepository, landedRepository } from "../../cli/test/face/landedFixture.ts";
import { GIT_CHILDREN_BOUND } from "../src/mainLine.ts";

const observed = vi.hoisted(() => {
  const sync: string[] = [];
  return { sync, inFlight: 0, most: 0, spawned: 0 };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  const tracked = <T extends ChildProcess>(child: T): T => {
    observed.spawned += 1;
    observed.inFlight += 1;
    observed.most = Math.max(observed.most, observed.inFlight);
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      observed.inFlight -= 1;
    };
    child.once("close", end);
    child.once("error", end);
    return child;
  };
  return {
    ...actual,
    spawn: (...args: Parameters<typeof actual.spawn>) => tracked(actual.spawn(...args)),
    execFile: (...args: Parameters<typeof actual.execFile>) => tracked(actual.execFile(...args)),
    spawnSync: (...args: Parameters<typeof actual.spawnSync>) => {
      observed.sync.push(`spawnSync ${String(args[0])}`);
      return actual.spawnSync(...args);
    },
    execSync: (...args: Parameters<typeof actual.execSync>) => {
      observed.sync.push(`execSync ${String(args[0])}`);
      return actual.execSync(...args);
    },
    execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
      observed.sync.push(`execFileSync ${String(args[0])}`);
      return actual.execFileSync(...args);
    },
  };
});

const SYNC_CHILD = /\b(?:spawnSync|execSync|execFileSync)\b/;
const packagesRoot = join(import.meta.dirname, "..", "..");
const runsRoot = join(import.meta.dirname, ".runs");

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function sourcesUnder(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourcesUnder(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

function syncUsesIn(paths: readonly string[]): readonly string[] {
  return paths.filter((path) => SYNC_CHILD.test(readFileSync(path, "utf-8")));
}

function repository(prefix: string): LandedRepository {
  const graphs = Object.fromEntries(
    ["one", "two", "three"].map((graph) => [
      `${prefix}-${graph}`,
      ["a", "b", "c", "d"].map((node) => `${graph}-${node}`),
    ]),
  );
  const built = landedRepository(runsRoot, graphs);
  roots.push(built.root);
  return built;
}

describe("no blocking git on the read path", () => {
  it("finds no spawnSync, execSync or execFileSync anywhere in packages/face/src", () => {
    expect(syncUsesIn(sourcesUnder(join(packagesRoot, "face", "src")))).toEqual([]);
  });

  it("finds none in the cli's position read path, journal-directory resolution included", () => {
    expect(
      syncUsesIn([
        join(packagesRoot, "cli", "src", "position.ts"),
        join(packagesRoot, "cli", "src", "herdrStatus.ts"),
        join(packagesRoot, "cli", "src", "repositoryOrigin.ts"),
        join(packagesRoot, "face", "src", "root.ts"),
        ...sourcesUnder(join(packagesRoot, "ledger", "src")),
      ]),
    ).toEqual([]);
  });

  it("runs a two-repository position read with no synchronous child and at most the shared bound of git children", async () => {
    const first = repository("left");
    const second = repository("right");
    const clearedNodes = first.cleared.length + second.cleared.length;
    expect(clearedNodes).toBeGreaterThan(GIT_CHILDREN_BOUND);
    expect(observed.sync.some((call) => call.startsWith("execFileSync git"))).toBe(true);
    observed.sync.splice(0);
    observed.inFlight = 0;
    observed.most = 0;
    observed.spawned = 0;

    const result = await runInterlockPosition(
      ["--json", "--repo", first.root, "--repo", second.root],
      { cwd: first.root },
    );

    expect(result.exitCode).toBe(0);
    expect(observed.sync).toEqual([]);
    expect(observed.spawned).toBeGreaterThan(clearedNodes);
    expect(observed.most).toBeGreaterThan(1);
    expect(observed.most).toBeLessThanOrEqual(GIT_CHILDREN_BOUND);
    expect(observed.inFlight).toBe(0);
    const parsed: unknown = JSON.parse(result.message);
    expect(parsed).toMatchObject({
      repositories: [
        { state: "found", journal: { state: "read" } },
        { state: "found", journal: { state: "read" } },
      ],
    });
    expect(JSON.stringify(parsed).match(/"kind":"on-main"/g)).toHaveLength(clearedNodes);
  });
});
