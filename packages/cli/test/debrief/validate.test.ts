import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateDebrief } from "../../src/debrief/validate.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const SHA = "b".repeat(40);

function repoWithSession(
  graph: string,
  node: string,
  debriefYaml: string | undefined,
  notesYaml: string | undefined,
): string {
  directory = mkdtempSync(join(runsRoot, "validate-"));
  const dir = join(directory, ".interlock", "sessions", graph, node);
  mkdirSync(dir, { recursive: true });
  if (debriefYaml !== undefined)
    writeFileSync(join(dir, "debrief.yaml"), debriefYaml);
  if (notesYaml !== undefined)
    writeFileSync(join(dir, "notes.yaml"), notesYaml);
  return directory;
}

const notesYaml = [
  "interlock: notes@v0",
  "node: n",
  "entries:",
  "  - kind: choice",
  '    at: "2026-09-10T00:00:00Z"',
  "    chose: a thing",
  "    because: it mattered",
  "",
].join("\n");

const v0Debrief = [
  "interlock: debrief@v0",
  "graph: g",
  "node: n",
  `base_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

const v1Debrief = [
  "interlock: debrief@v1",
  "graph: g",
  "node: n",
  "role: worker",
  `graph_base_sha: ${SHA}`,
  `session_start_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions:",
  "  - id: c1",
  "    what: a thing",
  "    rests_on: []",
  "    hunks: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

const v2Debrief = [
  "interlock: debrief@v2",
  "graph: g",
  "node: n",
  "role: worker",
  `graph_base_sha: ${SHA}`,
  `session_start_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions:",
  "  - id: c1",
  "    what: a thing",
  "    because: notes:1",
  "    rests_on: []",
  "    hunks: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

const brokenNotesYaml = [
  "interlock: notes@v0",
  "node: n",
  "entries:",
  "  - kind: choice",
  '    at: "2026-09-10T00:00:00Z"',
  "    chose: a thing",
  "",
].join("\n");

describe("validateDebrief", () => {
  it("refuses with no arguments, naming the expected form", async () => {
    const result = await validateDebrief([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock debrief validate");
  });

  it("refuses --file with no path", async () => {
    const result = await validateDebrief(["--file"]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--file");
  });

  it("gives the exact sentence when no debrief was filed", async () => {
    const cwd = repoWithSession("g", "n", undefined, undefined);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "no debrief was filed for g/n; the session is interrupted.",
    );
  });

  it("tolerates a debrief predating notes.yaml, since the file never existed for that vintage", async () => {
    const cwd = repoWithSession("g", "n", v0Debrief, undefined);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("no notes were appended.");
  });

  it("validates a debrief@v0 file as legacy-valid, not ingested", async () => {
    const cwd = repoWithSession("g", "n", v0Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v0; not ingested.");
    expect(result.message).toContain("role");
    expect(result.message).toContain("session_start_sha");
  });

  it("validates a debrief@v1 file as legacy-valid, reporting the missing because count", async () => {
    const cwd = repoWithSession("g", "n", v1Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v1; not ingested.");
    expect(result.message).toContain('"because" on 1 of 1 decisions');
  });

  it("validates a debrief@v2 file and produces a Debrief", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v2.");
  });

  it("refuses a note entry that is missing a required field, naming the index", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, brokenNotesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("entry 0");
    expect(result.message).toContain("because");
  });

  it("--file validates a single debrief file by hand", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, notesYaml);
    const path = join(cwd, ".interlock", "sessions", "g", "n", "debrief.yaml");
    const result = await validateDebrief(["--file", path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v2.");
  });

  it("--file validates a single notes file by hand", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, notesYaml);
    const path = join(cwd, ".interlock", "sessions", "g", "n", "notes.yaml");
    const result = await validateDebrief(["--file", path]);
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as notes@v0.");
  });
});
