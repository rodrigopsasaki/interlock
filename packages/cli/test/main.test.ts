import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

describe("interlock debrief validate", () => {
  it("refuses with no arguments, naming the expected form", async () => {
    const result = await run(["debrief", "validate"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock debrief validate");
  });
});

describe("interlock session show", () => {
  it("routes by its group and action, refusing before touching disk when no graph or node is given", async () => {
    const result = await run(["session", "show"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock session show");
  });
});

describe("an unknown command", () => {
  it("also fails closed rather than exiting quietly", async () => {
    const result = await run(["graph", "status"]);

    expect(result.exitCode).not.toBe(0);
  });
});

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function isolatedRepo(): string {
  directory = mkdtempSync(join(runsRoot, "main-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  execFileSync("git", ["-c", "init.defaultBranch=main", "init", "--quiet"], {
    cwd: directory,
  });
  execFileSync(
    "git",
    [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "fixture root",
    ],
    { cwd: directory, env: GIT_ENV },
  );
  return directory;
}

describe("dispatch to the runner commands", () => {
  it("routes run, judge and backfill by their first argument, refusing before touching disk", async () => {
    const run1 = await run(["run"]);
    expect(run1.exitCode).not.toBe(0);
    expect(run1.message).toContain("interlock run");

    const judge1 = await run(["judge"]);
    expect(judge1.exitCode).not.toBe(0);
    expect(judge1.message).toContain("interlock judge");

    const backfill1 = await run(["backfill"]);
    expect(backfill1.exitCode).not.toBe(0);
    expect(backfill1.message).toContain("interlock backfill");
  });

  it("routes sweep by its first argument, isolated from this repository's own journal", async () => {
    const cwd = isolatedRepo();
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      const sweep1 = await run(["sweep"]);
      expect(sweep1.exitCode).toBe(0);
      expect(sweep1.message).toContain("no expired");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
