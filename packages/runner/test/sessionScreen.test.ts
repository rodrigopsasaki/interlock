import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  lastNonEmptyLine,
  screenPath,
  writeScreenSnapshot,
} from "../src/sessionScreen.ts";

const runsRoot = join(import.meta.dirname, ".session-screen-runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureDir(): string {
  directory = mkdtempSync(join(runsRoot, "screen-"));
  return directory;
}

describe("screenPath", () => {
  it("nests under .interlock/sessions/<graph>/<node> inside the worktree", () => {
    expect(screenPath("/worktree", "demo", "a")).toBe(
      "/worktree/.interlock/sessions/demo/a/screen.txt",
    );
  });
});

describe("lastNonEmptyLine", () => {
  it("returns the last line that carries content, ignoring trailing blank lines", () => {
    expect(lastNonEmptyLine("one\ntwo\n\n")).toBe("two");
  });

  it("returns undefined for text with no content", () => {
    expect(lastNonEmptyLine("\n \n")).toBeUndefined();
    expect(lastNonEmptyLine("")).toBeUndefined();
  });
});

describe("writeScreenSnapshot", () => {
  it("creates the session directory and writes the screen text", async () => {
    const worktreePath = fixtureDir();

    await writeScreenSnapshot(worktreePath, "demo", "a", "the screen text\n");

    const written = screenPath(worktreePath, "demo", "a");
    expect(existsSync(written)).toBe(true);
    expect(readFileSync(written, "utf-8")).toBe("the screen text\n");
  });

  it("is best-effort: a destination blocked by a file never throws", async () => {
    const worktreePath = fixtureDir();
    mkdirSync(join(worktreePath, ".interlock", "sessions", "demo"), {
      recursive: true,
    });
    writeFileSync(
      join(worktreePath, ".interlock", "sessions", "demo", "a"),
      "not a directory",
    );

    await expect(
      writeScreenSnapshot(worktreePath, "demo", "a", "text"),
    ).resolves.toBeUndefined();
  });
});
