import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { commitAll, gitInitFixture } from "./support/gitFixture.ts";

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
// The fixture under test pins maintenance.autoDetach=false so that any
// maintenance the commit launches finishes before the commit returns, making
// its writes observable without racing the daemon.
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

describe("a fixture commit", () => {
  it("launches no auto-maintenance into the repository, even when it is due", () => {
    const dir = mkdtempSync(join(runsRoot, "run-"));
    directory = dir;
    gitInitFixture(dir);
    execFileSync("git", ["config", "maintenance.autoDetach", "false"], { cwd: dir });
    const contents = contentsInSampledShard(2);
    contents.forEach((content, index) => {
      writeFileSync(join(dir, `f${index}`), content);
    });

    commitAll(dir, "root");

    const objects = join(dir, ".git", "objects");
    expect(readdirSync(join(objects, "pack"))).toEqual([]);
    expect(readdirSync(join(objects, SAMPLED_SHARD))).toEqual(
      expect.arrayContaining(contents.map((content) => blobId(content).slice(2))),
    );
  });
});
