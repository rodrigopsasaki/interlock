import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateBrief } from "../../src/brief/validate.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function repoWithBrief(
  graph: string,
  node: string,
  briefContent: string | undefined,
): string {
  directory = mkdtempSync(join(runsRoot, "validate-"));
  const dir = join(directory, ".interlock", "sessions", graph, node);
  mkdirSync(dir, { recursive: true });
  if (briefContent !== undefined)
    writeFileSync(join(dir, "brief.md"), briefContent);
  return directory;
}

const v1Brief = [
  "---",
  "interlock: brief@v1",
  "graph: g",
  "node: n",
  "role: worker",
  "gates:",
  "  - id: typecheck",
  "    kind: command",
  "    run: pnpm typecheck",
  "scope:",
  "  - packages/x.ts",
  "substrate:",
  "  address: none",
  "---",
  "",
  "# brief",
  "",
].join("\n");

describe("validateBrief", () => {
  it("refuses with no arguments, naming the expected form", async () => {
    const result = await validateBrief([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock brief validate");
  });

  it("refuses --file with no path", async () => {
    const result = await validateBrief(["--file"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--file");
  });

  it("reports a hand-written brief as valid brief@v0", async () => {
    const cwd = repoWithBrief("g", "n", "# Brief · node `n` · graph `g`\n");
    const result = await validateBrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain(
      "valid as brief@v0; the runner requires brief@v1.",
    );
  });

  it("reports a brief@v1 file as valid", async () => {
    const cwd = repoWithBrief("g", "n", v1Brief);
    const result = await validateBrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as brief@v1.");
  });

  it("names the brief path relative to the repository, not absolutely", async () => {
    const cwd = repoWithBrief("g", "n", v1Brief);
    const result = await validateBrief(["g", "n"], { cwd });
    expect(result.message).not.toContain(cwd);
    expect(result.message).toContain(
      join(".interlock", "sessions", "g", "n", "brief.md"),
    );
  });

  it("refuses a missing brief, naming the path", async () => {
    const cwd = repoWithBrief("g", "n", undefined);
    const result = await validateBrief(["g", "n"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("--file validates a single brief file by hand", async () => {
    const cwd = repoWithBrief("g", "n", v1Brief);
    const path = join(cwd, ".interlock", "sessions", "g", "n", "brief.md");
    const result = await validateBrief(["--file", path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as brief@v1.");
  });

  it("--file validates the shipped brief@v1 fixture", async () => {
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
    const result = await validateBrief(["--file", path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as brief@v1.");
  });
});
