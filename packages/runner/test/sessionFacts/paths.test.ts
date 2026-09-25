import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveClaudeSessionPath } from "../../src/claude/adapter.ts";
import { findCodexSessionPath } from "../../src/herdr/codex.ts";

const RUNS = join(import.meta.dirname, "..", ".runs");
mkdirSync(RUNS, { recursive: true });

let home: string | undefined;

afterEach(() => {
  if (home !== undefined) rmSync(home, { recursive: true, force: true });
  home = undefined;
});

describe("session record path resolution", () => {
  it("finds Codex ids below the configured sessions tree", async () => {
    home = mkdtempSync(join(RUNS, "codex-home-"));
    const record = join(home, "sessions", "2026", "09", "25", "rollout-12-34-codex-id.jsonl");
    mkdirSync(join(home, "sessions", "2026", "09", "25"), { recursive: true });
    writeFileSync(record, "");

    await expect(findCodexSessionPath("codex-id", home)).resolves.toBe(record);
  });

  it("escapes the Claude cwd exactly at the configured projects boundary", () => {
    const config = join(RUNS, "claude-config");
    expect(resolveClaudeSessionPath("claude-id", "/Users/name/repo.worktree", config)).toBe(
      join(config, "projects", "-Users-name-repo-worktree", "claude-id.jsonl"),
    );
  });
});
