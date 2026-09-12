import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runSchemaValidate } from "../../src/schema/validate.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(name: string, content: string): string {
  directory = mkdtempSync(join(runsRoot, "schema-validate-"));
  const path = join(directory, name);
  writeFileSync(path, content);
  return path;
}

describe("runSchemaValidate", () => {
  it("refuses with no arguments, naming the expected form", async () => {
    const result = await runSchemaValidate([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock schema validate");
  });

  it("validates a well-formed notes@v0 file", async () => {
    const path = fixture(
      "notes.yaml",
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: choice",
        '    at: "2026-09-10T00:00:00Z"',
        "    chose: a thing",
        "    because: it mattered",
        "",
      ].join("\n"),
    );
    const result = await runSchemaValidate([path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as notes@v0.");
  });

  it("reports one sentence with a JSON pointer for a missing field", async () => {
    const path = fixture(
      "notes.yaml",
      [
        "interlock: notes@v0",
        "node: n",
        "entries:",
        "  - kind: choice",
        '    at: "2026-09-10T00:00:00Z"',
        "    chose: a thing",
        "",
      ].join("\n"),
    );
    const result = await runSchemaValidate([path]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("invalid as notes@v0");
  });

  it("reports a legacy brief.md the same way the brief reader does", async () => {
    const path = fixture("brief.md", "# Brief · node `n` · graph `g`\n\nNo front matter here.\n");
    const result = await runSchemaValidate([path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as brief@v0; the runner requires brief@v1.");
  });

  it("validates a brief@v1 fixture", async () => {
    const path = join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "debrief",
      "test",
      "fixtures",
      "brief-v1.md",
    );
    const result = await runSchemaValidate([path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as brief@v1.");
  });

  it("validates every line of a small journal file", async () => {
    const path = fixture(
      "journal.jsonl",
      [
        '{"interlock":"event@v4","kind":"node-created","node":{"graph":"g","id":"g"}}',
        '{"interlock":"event@v4","kind":"unknown-thing"}',
        "",
      ].join("\n"),
    );
    const result = await runSchemaValidate([path]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain(`${path}:1: valid as event@v4.`);
    expect(result.message).toContain(`${path}:2:`);
  });
});
