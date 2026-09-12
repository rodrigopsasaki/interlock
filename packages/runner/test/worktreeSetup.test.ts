import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { explainWorktreeSetupRefusal, runSetupCommand } from "../src/worktreeSetup.ts";

const runsRoot = join(import.meta.dirname, ".worktree-setup-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureDir(): string {
  directory = mkdtempSync(join(runsRoot, "setup-"));
  return directory;
}

describe("runSetupCommand", () => {
  it("succeeds through the pinned-toolchain invocation", async () => {
    const cwd = fixtureDir();

    const result = await runSetupCommand("true", cwd);

    expect(isOk(result)).toBe(true);
  });

  it("refuses on a non-zero exit, naming the command and the exit code", async () => {
    const cwd = fixtureDir();

    const result = await runSetupCommand("false", cwd);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({
      kind: "command-failed",
      command: "false",
      exitCode: 1,
    });
    expect(explainWorktreeSetupRefusal(result.error)).toBe('"false" exited 1.');
  });
});
