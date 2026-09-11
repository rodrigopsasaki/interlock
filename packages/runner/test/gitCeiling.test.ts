import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".git-ceiling-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("GIT_CEILING_DIRECTORIES", () => {
  it("refuses a git command in a fixture whose own .git was removed, instead of walking up into the enclosing repository", () => {
    directory = mkdtempSync(join(runsRoot, "orphan-"));
    writeFileSync(join(directory, "root.txt"), "root\n");
    gitInitFixtureWithContent(directory);
    rmSync(join(directory, ".git"), { recursive: true, force: true });

    expect(() =>
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: directory,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrowError(/not a git repository/);
  });
});
