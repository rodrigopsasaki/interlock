import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepositoryLinks } from "../../../scripts/runs-links-stay-inside.ts";
import { runStateFolderCheck } from "../../../scripts/state-folder-untouched.ts";
import { allocateToolState } from "./support/toolState.ts";

const repositoryRoot = realpathSync(resolve(import.meta.dirname, "../../.."));
const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), `interlock-${prefix}-`));
  temporaryRoots.push(root);
  return root;
}

function command(source: string): readonly string[] {
  return [process.execPath, "-e", source];
}

describe("tool state outside repositories", () => {
  it("allocates unique state under the system temporary directory", () => {
    const first = allocateToolState("proof-one");
    const second = allocateToolState("proof-two");
    expect(first.directory).not.toBe(second.directory);
    expect(first.directory.startsWith(realpathSync(tmpdir()))).toBe(true);
    expect(second.directory.startsWith(realpathSync(tmpdir()))).toBe(true);
    first.cleanup();
    second.cleanup();
  });

  it("keeps concurrent tool state out of the repository while it is live", () => {
    const first = allocateToolState("concurrent-one");
    const second = allocateToolState("concurrent-two");
    try {
      const result = scanRepositoryLinks(repositoryRoot);
      expect(result.failure).toBeUndefined();
      expect(result.links).toEqual([]);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it("does not follow a live state link after a child is interrupted", () => {
    const state = allocateToolState("interrupted");
    const target = join(state.directory, "outside-target");
    mkdirSync(target);
    symlinkSync(target, join(state.directory, "trusted-config"));
    const result = scanRepositoryLinks(repositoryRoot);
    expect(result.failure).toBeUndefined();
    expect(result.links).toEqual([]);
    state.cleanup();
  });

  it("detects outward links without dereferencing them", () => {
    const root = temporaryRoot("links");
    const outside = temporaryRoot("outside");
    writeFileSync(join(root, "inside.txt"), "inside\n");
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, ".git"));
    symlinkSync(join(root, "inside.txt"), join(root, "internal"));
    symlinkSync(join(root, "chain"), join(root, "chain-start"));
    symlinkSync(join(outside, "missing"), join(root, "chain"));
    symlinkSync(join(outside, "absolute"), join(root, "node_modules", "absolute"));
    symlinkSync(join(outside, "relative"), join(root, ".git", "relative"));
    symlinkSync(join(outside, "dangling"), join(root, "dangling"));
    symlinkSync(join(root, "cycle-b"), join(root, "cycle-a"));
    symlinkSync(join(root, "cycle-a"), join(root, "cycle-b"));

    const result = scanRepositoryLinks(root);

    expect(result.failure).toBeUndefined();
    expect(result.links.map((link) => link.path)).toEqual(
      expect.arrayContaining([
        join(root, "node_modules", "absolute"),
        join(root, ".git", "relative"),
        join(root, "dangling"),
      ]),
    );
    expect(result.links.some((link) => link.path === join(root, "internal"))).toBe(false);
    expect(result.links.some((link) => link.path === join(root, "cycle-a"))).toBe(false);
  });

  it("reports missing and non-directory roots as incomplete scans", () => {
    const missing = scanRepositoryLinks(join(temporaryRoot("missing"), "not-there"));
    expect(missing.failure?.reason).toContain("unreadable entry");
    const file = join(temporaryRoot("file-root"), "root.txt");
    writeFileSync(file, "root\n");
    expect(scanRepositoryLinks(file).failure?.reason).toContain("not a directory");
  });

  it("fails by name when an account state entry is added", () => {
    const account = temporaryRoot("account-added");
    const state = join(account, ".local", "state", "interlock");
    mkdirSync(state, { recursive: true });
    const added = join(state, "fixture-added");
    const result = runStateFolderCheck({
      accountHome: account,
      repositoryRoot,
      journalFile: join(temporaryRoot("journal-added"), "journal.jsonl"),
      command: command(`require("node:fs").mkdirSync(${JSON.stringify(added)})`),
    });
    expect(result).toBe(1);
  });

  it("permits changes under a live session but not after its outcome", () => {
    const account = temporaryRoot("account-session");
    const state = join(account, ".local", "state", "interlock");
    const journal = join(temporaryRoot("journal-session"), "journal.jsonl");
    const sessionDirectory = join(state, "codex-homes", "graph", "node");
    mkdirSync(state, { recursive: true });
    mkdirSync(join(journal, ".."), { recursive: true });
    writeFileSync(
      journal,
      `${JSON.stringify({ kind: "session-started", session: { id: "session", node: { graph: "graph", id: "node" } } })}\n`,
    );
    const live = runStateFolderCheck({
      accountHome: account,
      repositoryRoot,
      journalFile: journal,
      command: command(
        `require("node:fs").mkdirSync(${JSON.stringify(sessionDirectory)}, { recursive: true }); require("node:fs").writeFileSync(${JSON.stringify(join(sessionDirectory, "overlay"))}, "fixture")`,
      ),
    });
    expect(live).toBe(0);

    writeFileSync(
      journal,
      `${JSON.stringify({ kind: "session-started", session: { id: "session", node: { graph: "graph", id: "node" } } })}\n${JSON.stringify({ kind: "outcome-set", node: { graph: "graph", id: "node" }, outcome: { kind: "cleared" } })}\n`,
    );
    const ended = runStateFolderCheck({
      accountHome: account,
      repositoryRoot,
      journalFile: journal,
      command: command(
        `require("node:fs").writeFileSync(${JSON.stringify(join(sessionDirectory, "after"))}, "fixture")`,
      ),
    });
    expect(ended).toBe(1);
  });

  it("checks the account-derived folder instead of HOME or XDG_STATE_HOME", () => {
    const account = temporaryRoot("account-derived");
    const other = temporaryRoot("other-state");
    const state = join(account, ".local", "state", "interlock");
    const wrong = join(other, "interlock");
    mkdirSync(state, { recursive: true });
    mkdirSync(wrong, { recursive: true });
    const previousHome = process.env["HOME"];
    const previousState = process.env["XDG_STATE_HOME"];
    process.env["HOME"] = other;
    process.env["XDG_STATE_HOME"] = other;
    try {
      const result = runStateFolderCheck({
        accountHome: account,
        repositoryRoot,
        journalFile: join(temporaryRoot("journal-derived"), "journal.jsonl"),
        command: command(
          `require("node:fs").writeFileSync(${JSON.stringify(join(state, "checked"))}, "fixture")`,
        ),
      });
      expect(result).toBe(1);
      expect(() => unlinkSync(join(wrong, "checked"))).toThrow();
    } finally {
      if (previousHome === undefined) delete process.env["HOME"];
      else process.env["HOME"] = previousHome;
      if (previousState === undefined) delete process.env["XDG_STATE_HOME"];
      else process.env["XDG_STATE_HOME"] = previousState;
    }
  });

  it("passes the child exit code when the state is unchanged", () => {
    const account = temporaryRoot("account-exit");
    mkdirSync(join(account, ".local", "state", "interlock"), { recursive: true });
    const result = runStateFolderCheck({
      accountHome: account,
      repositoryRoot,
      journalFile: join(temporaryRoot("journal-exit"), "journal.jsonl"),
      command: command("process.exit(7)"),
    });
    expect(result).toBe(7);
  });
});
