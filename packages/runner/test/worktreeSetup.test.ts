import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  explainWorktreeSetupRefusal,
  runSetupCommand,
  SETUP_LOG_TAIL_BYTES,
} from "../src/worktreeSetup.ts";

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

function fixtureScript(cwd: string, name: string, source: string): string {
  const path = join(cwd, name);
  writeFileSync(path, source);
  return path;
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
      exit: { kind: "exit", code: 1 },
      tail: "",
    });
    expect(explainWorktreeSetupRefusal(result.error)).toBe('"false" exited 1.');
  });

  it("keeps a failing command's stderr in the refusal's explanation", async () => {
    const cwd = fixtureDir();
    const script = fixtureScript(
      cwd,
      "stderr-fail.mjs",
      'console.error("boom from setup");\nprocess.exit(3);\n',
    );

    const result = await runSetupCommand(`node ${script}`, cwd);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.exit).toEqual({ kind: "exit", code: 3 });
    const explanation = explainWorktreeSetupRefusal(result.error);
    expect(explanation).toContain("exited 3");
    expect(explanation).toContain("boom from setup");
  });

  it("truncates output past the bound to its tail", async () => {
    const cwd = fixtureDir();
    const script = fixtureScript(
      cwd,
      "big-output.mjs",
      [
        "for (let i = 0; i < 2000; i++) {",
        '  console.log("line-" + i + "-" + "x".repeat(60));',
        "}",
        "process.exit(1);",
        "",
      ].join("\n"),
    );

    const result = await runSetupCommand(`node ${script}`, cwd);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(Buffer.byteLength(result.error.tail)).toBeLessThanOrEqual(SETUP_LOG_TAIL_BYTES);
    expect(result.error.tail).toContain("line-1999-");
    expect(result.error.tail).not.toContain("line-0-");
  });

  it("says which signal killed the command instead of -1", async () => {
    const cwd = fixtureDir();
    const script = fixtureScript(cwd, "self-kill.mjs", "process.kill(process.pid, 'SIGKILL');\n");

    const result = await runSetupCommand(`node ${script}`, cwd);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.exit).toEqual({ kind: "signal", signal: "SIGKILL" });
    expect(explainWorktreeSetupRefusal(result.error)).toContain("was killed by SIGKILL");
  });
});
