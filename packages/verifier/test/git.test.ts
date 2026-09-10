import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  diffFiles,
  fileContentAt,
  isAncestor,
  isCommit,
  pathExistsAt,
} from "../src/git.ts";
import { commitAll, gitInitFixture } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function freshRepo(): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  return directory;
}

describe("isCommit / isAncestor", () => {
  it("recognizes a real commit and the ancestor relationship between two", () => {
    const dir = freshRepo();
    writeFileSync(join(dir, "a.ts"), "export const a = 1;\n");
    const from = commitAll(dir, "first");
    writeFileSync(join(dir, "a.ts"), "export const a = 2;\n");
    const to = commitAll(dir, "second");

    expect(isCommit(dir, from)).toBe(true);
    expect(isCommit(dir, to)).toBe(true);
    expect(isCommit(dir, "f".repeat(40))).toBe(false);
    expect(isAncestor(dir, from, to)).toBe(true);
    expect(isAncestor(dir, to, from)).toBe(false);
    expect(isAncestor(dir, from, from)).toBe(true);
  });
});

describe("pathExistsAt / fileContentAt", () => {
  it("checks files and directories at a SHA, and reads a file's content there", () => {
    const dir = freshRepo();
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "sub", "b.ts"), "export const b = 1;\n");
    const sha = commitAll(dir, "first");

    expect(pathExistsAt(dir, sha, "sub/b.ts")).toBe(true);
    expect(pathExistsAt(dir, sha, "sub")).toBe(true);
    expect(pathExistsAt(dir, sha, "nope.ts")).toBe(false);
    expect(fileContentAt(dir, sha, "sub/b.ts")).toBe("export const b = 1;\n");
    expect(fileContentAt(dir, sha, "nope.ts")).toBeUndefined();
  });
});

describe("diffFiles", () => {
  it("reports a new file's whole range as one added hunk", () => {
    const dir = freshRepo();
    writeFileSync(join(dir, "placeholder.txt"), "\n");
    const from = commitAll(dir, "root");
    writeFileSync(
      join(dir, "new.ts"),
      "export const a = 1;\nexport const b = 2;\n",
    );
    const to = commitAll(dir, "add new.ts");

    const files = diffFiles(dir, from, to);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("new.ts");
    expect(files[0]?.hunks).toEqual([{ start: 1, end: 2 }]);
    expect(files[0]?.addedLines).toEqual([
      "export const a = 1;",
      "export const b = 2;",
    ]);
  });

  it("reports several separate hunks for one modified file", () => {
    const dir = freshRepo();
    const lines = Array.from(
      { length: 10 },
      (_unused, i) => `const l${i} = ${i};`,
    );
    writeFileSync(join(dir, "many.ts"), `${lines.join("\n")}\n`);
    const from = commitAll(dir, "first");

    lines[1] = "const l1 = 100;";
    lines[8] = "const l8 = 800;";
    writeFileSync(join(dir, "many.ts"), `${lines.join("\n")}\n`);
    const to = commitAll(dir, "second");

    const files = diffFiles(dir, from, to);
    expect(files).toHaveLength(1);
    expect(files[0]?.hunks).toEqual([
      { start: 2, end: 2 },
      { start: 9, end: 9 },
    ]);
  });

  it("reports a pure deletion with no added lines, path still present", () => {
    const dir = freshRepo();
    writeFileSync(join(dir, "gone.ts"), "export const a = 1;\n");
    const from = commitAll(dir, "first");
    rmSync(join(dir, "gone.ts"));
    const to = commitAll(dir, "delete gone.ts");

    const files = diffFiles(dir, from, to);
    expect(files).toHaveLength(1);
    expect(files[0]?.path).toBe("gone.ts");
    expect(files[0]?.hunks).toEqual([]);
    expect(files[0]?.addedLines).toEqual([]);
  });
});
