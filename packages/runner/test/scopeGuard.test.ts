import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { buildOpeningPrompt, type SessionRole } from "../src/openingPrompt.ts";
import {
  changedScopePaths,
  describeScopeChange,
  type ScopeSnapshot,
  snapshotScope,
} from "../src/scopeGuard.ts";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let runRoot: string | undefined;

afterEach(() => {
  if (runRoot !== undefined) rmSync(runRoot, { recursive: true, force: true });
  runRoot = undefined;
});

function fixtureWorktree(): {
  readonly main: string;
  readonly worktree: string;
  readonly watch: string;
} {
  runRoot = mkdtempSync(join(runsRoot, "scope-guard-"));
  const main = join(runRoot, "main");
  const worktree = join(runRoot, "linked");
  const watch = join(runRoot, "watched");
  mkdirSync(main, { recursive: true });
  writeFileSync(join(main, "tracked.txt"), "before\n");
  gitInitFixtureWithContent(main);
  fixtureGit(["worktree", "add", "--quiet", "-b", "fixture/scope-guard", worktree, "HEAD"], {
    cwd: main,
  });
  mkdirSync(watch, { recursive: true });
  return { main, worktree, watch };
}

function requireSnapshot(worktree: string, watchPaths: readonly string[] = []): ScopeSnapshot {
  const snapshot = snapshotScope(worktree, watchPaths);
  if (!isOk(snapshot)) throw new Error(`${snapshot.error.path}: ${snapshot.error.because}`);
  return snapshot.value;
}

describe("scope guard snapshots", () => {
  it("holds a fixture agent turn that writes a new file into the main checkout", async () => {
    const fixture = fixtureWorktree();
    const before = requireSnapshot(fixture.worktree);
    await Promise.resolve(writeFileSync(join(fixture.main, "outside.txt"), "outside\n"));
    const after = requireSnapshot(fixture.worktree);

    const changes = changedScopePaths(before, after);

    expect(changes.map(describeScopeChange)).toEqual(["main checkout/outside.txt"]);
    expect(readFileSync(join(fixture.main, "outside.txt"), "utf-8")).toBe("outside\n");
  });

  it("holds an edit to a tracked main-checkout file and keeps the edit", () => {
    const fixture = fixtureWorktree();
    const before = requireSnapshot(fixture.worktree);
    writeFileSync(join(fixture.main, "tracked.txt"), "edited\n");
    const after = requireSnapshot(fixture.worktree);

    expect(changedScopePaths(before, after).map(describeScopeChange)).toEqual([
      "main checkout/tracked.txt",
    ]);
    expect(readFileSync(join(fixture.main, "tracked.txt"), "utf-8")).toBe("edited\n");
  });

  it("holds a write under a configured watch path", () => {
    const fixture = fixtureWorktree();
    const before = requireSnapshot(fixture.worktree, [fixture.watch]);
    writeFileSync(join(fixture.watch, "watched.txt"), "watched\n");
    const after = requireSnapshot(fixture.worktree, [fixture.watch]);

    expect(changedScopePaths(before, after).map(describeScopeChange)).toEqual([
      `watch path ${fixture.watch}/watched.txt`,
    ]);
  });

  it("passes worktree-only writes and unchanged pre-existing main-checkout dirt", () => {
    const fixture = fixtureWorktree();
    writeFileSync(join(fixture.main, "already-dirty.txt"), "dirty\n");
    const before = requireSnapshot(fixture.worktree);
    writeFileSync(join(fixture.worktree, "worktree.txt"), "local\n");
    const after = requireSnapshot(fixture.worktree);

    expect(changedScopePaths(before, after)).toEqual([]);
  });

  it("does not count writes under the main checkout's interlock ledger or sessions", () => {
    const fixture = fixtureWorktree();
    const before = requireSnapshot(fixture.worktree);
    mkdirSync(join(fixture.main, ".interlock", "ledger"), { recursive: true });
    mkdirSync(join(fixture.main, ".interlock", "sessions"), { recursive: true });
    writeFileSync(join(fixture.main, ".interlock", "ledger", "event"), "ledger\n");
    writeFileSync(join(fixture.main, ".interlock", "sessions", "session"), "session\n");
    const after = requireSnapshot(fixture.worktree);

    expect(changedScopePaths(before, after)).toEqual([]);
  });
});

describe("scope guard opening prompt", () => {
  it("asks every node role for relative paths", () => {
    const roles: readonly SessionRole[] = [
      "scout",
      "planner",
      "implementer",
      "tester",
      "reviewer",
      "verifier",
    ];
    for (const role of roles) {
      expect(buildOpeningPrompt("g", "n", undefined, role), role).toContain(
        "Give every file and patch path relative to this worktree, never absolute.",
      );
    }
  });
});
