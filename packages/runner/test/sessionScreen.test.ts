import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { lastNonEmptyLine, screenPath, writeScreenSnapshot } from "../src/sessionScreen.ts";

const runsRoot = join(import.meta.dirname, ".runs", "session-screen");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) execFileSync("rm", ["-r", directory]);
  directory = undefined;
});

function fixtureDir(): string {
  directory = mkdtempSync(join(runsRoot, "screen-"));
  return directory;
}

describe("screenPath", () => {
  it("nests under the runner's session-screen state outside the worktree", () => {
    expect(screenPath("/runner-state", "demo", "a")).toBe(
      "/runner-state/session-screen/demo/a/screen.txt",
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
    const runnerStateDirectory = fixtureDir();

    await writeScreenSnapshot(runnerStateDirectory, "demo", "a", "the screen text\n");

    const written = screenPath(runnerStateDirectory, "demo", "a");
    expect(existsSync(written)).toBe(true);
    expect(readFileSync(written, "utf-8")).toBe("the screen text\n");
  });

  it("is best-effort: a destination blocked by a file never throws", async () => {
    const runnerStateDirectory = fixtureDir();
    mkdirSync(join(runnerStateDirectory, "session-screen", "demo"), {
      recursive: true,
    });
    writeFileSync(join(runnerStateDirectory, "session-screen", "demo", "a"), "not a directory");

    await expect(
      writeScreenSnapshot(runnerStateDirectory, "demo", "a", "text"),
    ).resolves.toBeUndefined();
  });
});
