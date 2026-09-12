import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { explainNotesRefusal, readNotesFile } from "../src/notes.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function write(content: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  const path = join(directory, "notes.yaml");
  writeFileSync(path, content);
  return path;
}

describe("readNotesFile", () => {
  it("refuses a missing file, naming the path", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const path = join(directory, "notes.yaml");
    const result = await readNotesFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("missing-file");
    expect(explainNotesRefusal(result.error)).toContain(path);
  });

  it("refuses an unknown shape tag", async () => {
    const path = write(["interlock: notes@v1", "node: n", "entries: []", ""].join("\n"));
    const result = await readNotesFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("unknown-shape");
  });

  it("reads a choice and a surprise", async () => {
    const path = write(
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: choice",
        '    at: "2026-09-10T00:00:00Z"',
        "    chose: used a Map",
        "    because: matches the sibling table",
        "  - kind: surprise",
        '    at: "2026-09-10T00:05:00Z"',
        "    expected: pnpm --filter to work after the script name",
        "    observed: it does not",
        "",
      ].join("\n"),
    );
    const result = await readNotesFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value).toEqual([
      {
        kind: "choice",
        at: "2026-09-10T00:00:00Z",
        chose: "used a Map",
        because: "matches the sibling table",
      },
      {
        kind: "surprise",
        at: "2026-09-10T00:05:00Z",
        expected: "pnpm --filter to work after the script name",
        observed: "it does not",
      },
    ]);
  });

  it("keeps a rejected array, but drops a rejected field that parsed as a plain string", async () => {
    const path = write(
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: choice",
        '    at: "2026-09-10T00:00:00Z"',
        "    chose: used a Map",
        "    because: matches the sibling table",
        "    rejected: >",
        '      ["a folded scalar that looks like an array but is one string"]',
        "",
      ].join("\n"),
    );
    const result = await readNotesFile(path);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const [entry] = result.value;
    expect(entry?.kind).toBe("choice");
    expect(entry && "rejected" in entry ? entry.rejected : undefined).toBeUndefined();
  });

  it("refuses a choice entry missing because, naming the entry index", async () => {
    const path = write(
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: choice",
        '    at: "2026-09-10T00:00:00Z"',
        "    chose: used a Map",
        "",
      ].join("\n"),
    );
    const result = await readNotesFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.kind).toBe("invalid-entry");
    const message = explainNotesRefusal(result.error);
    expect(message).toContain("entry 0");
    expect(message).toContain("because");
  });

  it("refuses a surprise entry missing observed, naming the entry index", async () => {
    const path = write(
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: surprise",
        '    at: "2026-09-10T00:00:00Z"',
        "    expected: it would work",
        "",
      ].join("\n"),
    );
    const result = await readNotesFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    const message = explainNotesRefusal(result.error);
    expect(message).toContain("entry 0");
    expect(message).toContain("observed");
  });

  it("refuses an entry whose kind is outside the closed set", async () => {
    const path = write(
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: observation",
        '    at: "2026-09-10T00:00:00Z"',
        "",
      ].join("\n"),
    );
    const result = await readNotesFile(path);
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainNotesRefusal(result.error)).toContain("entry 0");
  });
});
