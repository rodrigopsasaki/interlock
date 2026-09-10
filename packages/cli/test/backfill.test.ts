import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixture } from "./graph/gitFixture.ts";
import { runInterlockBackfill } from "../src/backfill.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "backfill-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  gitInitFixture(directory);
  return directory;
}

describe("interlock backfill", () => {
  it("refuses without a graph id", async () => {
    const result = await runInterlockBackfill([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock backfill");
  });

  it("refuses without local.yaml, naming the fields", async () => {
    const cwd = fixture();
    const result = await runInterlockBackfill(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("local.yaml");
  });

  it("refuses a graph that has no file on disk", async () => {
    const cwd = fixture();
    writeFileSync(
      join(cwd, ".interlock", "local.yaml"),
      [
        "interlock: local@v0",
        "runtime:",
        "  kind: claude",
        "  args: []",
        "worktree_root: .worktrees",
        "lease_ms: 60000",
        "run_timeout_ms: 5000",
        "substrate:",
        "  address: none",
        "",
      ].join("\n"),
    );
    const result = await runInterlockBackfill(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });
});
