import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".git-ceiling-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("GIT_CEILING_DIRECTORIES", () => {
  it("refuses a git command in a fixture whose own .git was removed, instead of walking up into the enclosing repository", () => {
    const orphan = mkdtempSync(join(runsRoot, "orphan-"));
    directory = orphan;
    writeFileSync(join(orphan, "root.txt"), "root\n");
    gitInitFixtureWithContent(orphan);
    rmSync(join(orphan, ".git"), { recursive: true, force: true });

    expect(() =>
      fixtureGit(["rev-parse", "HEAD"], {
        cwd: orphan,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    ).toThrowError(/not a git repository/);
  });
});
