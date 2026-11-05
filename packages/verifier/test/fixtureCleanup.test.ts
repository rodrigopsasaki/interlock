import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  fixtureGit,
  unsuppressedGitForMaintenanceControl,
} from "../../../test/support/gitFixture.ts";
import { COMMIT_ARGS, commitAll, GIT_ENV, gitInitFixture } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

// Git's auto-maintenance estimates the loose-object count from the objects/17
// shard alone, times 256, so two loose objects there exceed the default
// threshold and make the detached daemon of `git commit` repack the repository
// after the commit has returned: a writer still creating files during teardown.
// The repository under test re-enables maintenance.auto, which fixture
// repositories otherwise pin off, so only the helper's per-invocation
// suppression can keep the commit from repacking; and it pins
// maintenance.autoDetach=false so that any maintenance the commit launches
// finishes before the commit returns, making its writes observable without
// racing a daemon.
const SAMPLED_SHARD = "17";

function blobId(content: string): string {
  return createHash("sha1")
    .update(`blob ${Buffer.byteLength(content)}\0${content}`)
    .digest("hex");
}

function contentsInSampledShard(count: number): readonly string[] {
  const found: string[] = [];
  for (let i = 0; found.length < count; i++) {
    const content = `content ${i}\n`;
    if (blobId(content).startsWith(SAMPLED_SHARD)) found.push(content);
  }
  return found;
}

interface DueRepository {
  readonly root: string;
  readonly contents: readonly string[];
}

function repositoryWithMaintenanceDue(): DueRepository {
  const root = mkdtempSync(join(runsRoot, "run-"));
  directory = root;
  gitInitFixture(root);
  fixtureGit(["config", "maintenance.auto", "true"], { cwd: root });
  fixtureGit(["config", "maintenance.autoDetach", "false"], { cwd: root });
  const contents = contentsInSampledShard(2);
  contents.forEach((content, index) => {
    writeFileSync(join(root, `f${index}`), content);
  });
  fixtureGit(["add", "-A"], { cwd: root });
  return { root, contents };
}

function packsOf(root: string): readonly string[] {
  return readdirSync(join(root, ".git", "objects", "pack")).filter((name) =>
    name.endsWith(".pack"),
  );
}

function looseInSampledShard(root: string): readonly string[] {
  return readdirSync(join(root, ".git", "objects", SAMPLED_SHARD));
}

describe("a commit into a repository whose auto-maintenance is due", () => {
  it("enables maintenance in the repository's own configuration, so no fixture default suppresses it", () => {
    const { root } = repositoryWithMaintenanceDue();

    expect(
      fixtureGit(["config", "--local", "--get", "maintenance.auto"], { cwd: root }).trim(),
    ).toBe("true");
  });

  it("repacks the repository when Git runs without the helper's suppression", () => {
    const { root } = repositoryWithMaintenanceDue();
    console.log(`maintenance positive control on ${fixtureGit(["--version"]).trim()}`);

    unsuppressedGitForMaintenanceControl([...COMMIT_ARGS, "root"], { cwd: root, env: GIT_ENV });

    expect(packsOf(root)).not.toEqual([]);
  });

  it("launches no auto-maintenance into the repository when the fixture helper commits", () => {
    const { root, contents } = repositoryWithMaintenanceDue();

    commitAll(root, "root");

    expect(packsOf(root)).toEqual([]);
    expect(looseInSampledShard(root)).toEqual(
      expect.arrayContaining(contents.map((content) => blobId(content).slice(2))),
    );
  });
});
