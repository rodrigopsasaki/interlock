import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDebriefRevise } from "../../src/debrief/revise.ts";
import { validateDebrief } from "../../src/debrief/validate.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
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
  if (debriefYaml !== undefined) writeFileSync(join(dir, "debrief.yaml"), debriefYaml);
  if (notesYaml !== undefined) writeFileSync(join(dir, "notes.yaml"), notesYaml);
  return directory;
}

function writeSessionBrief(cwd: string): void {
  writeFileSync(
    join(cwd, ".interlock", "sessions", "g", "n", "brief.md"),
    [
      "---",
      "interlock: brief@v1",
      "graph: g",
      "node: n",
      "role: worker",
      "gates: []",
      "scope: []",
      "substrate:",
      "  address: none",
      `graph_base_sha: ${SHA}`,
      "session: fixture-session",
      "---",
      "",
    ].join("\n"),
  );
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

const v2WithExtraDerivationMetadata = v2Debrief.replace(
  "  model: claude-sonnet-5",
  "  model: claude-sonnet-5\n  reasoning_effort: high",
);

const humanV2Debrief = v2Debrief.replace(
  ["  kind: agent", "  runtime: claude-code", "  model: claude-sonnet-5"].join("\n"),
  ["  kind: human", "  who: a person"].join("\n"),
);

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
    expect(result.message).toBe("no debrief was filed for g/n; the session is interrupted.");
  });

  it("tolerates a debrief predating notes.yaml, since the file never existed for that vintage", async () => {
    const cwd = repoWithSession("g", "n", v0Debrief, undefined);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("no notes were appended.");
  });

  it("names the debrief and notes paths relative to the repository, not absolutely", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).not.toContain(cwd);
    expect(result.message).toContain(join(".interlock", "sessions", "g", "n", "debrief.yaml"));
    expect(result.message).toContain(join(".interlock", "sessions", "g", "n", "notes.yaml"));
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

  it("keeps legacy debriefs with extra derivation metadata legacy-valid", async () => {
    const extra = "  model: claude-sonnet-5\n  reasoning_effort: high";
    const cwd = repoWithSession(
      "g",
      "n",
      v0Debrief.replace("  model: claude-sonnet-5", extra),
      notesYaml,
    );
    const v0 = await validateDebrief(["g", "n"], { cwd });
    writeFileSync(
      join(cwd, ".interlock", "sessions", "g", "n", "debrief.yaml"),
      v1Debrief.replace("  model: claude-sonnet-5", extra),
    );
    const v1 = await validateDebrief(["g", "n"], { cwd });

    expect(v0.exitCode).toBe(0);
    expect(v0.message).toContain("not ingested.");
    expect(v1.exitCode).toBe(0);
    expect(v1.message).toContain("not ingested.");
  });

  it("validates a debrief@v2 file and produces a Debrief", async () => {
    const cwd = repoWithSession("g", "n", v2Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v2.");
  });

  it("validates a human debrief@v2 through the published schema", async () => {
    const cwd = repoWithSession("g", "n", humanV2Debrief, notesYaml);
    const result = await validateDebrief(["g", "n"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("valid as debrief@v2.");
  });

  it("refuses extra v2 derivation metadata in both advertised forms", async () => {
    const cwd = repoWithSession("g", "n", v2WithExtraDerivationMetadata, notesYaml);
    const path = join(cwd, ".interlock", "sessions", "g", "n", "debrief.yaml");

    const graphNode = await validateDebrief(["g", "n"], { cwd });
    const file = await validateDebrief(["--file", path], { cwd });
    for (const result of [graphNode, file]) {
      expect(result.exitCode).not.toBe(0);
      expect(result.message).toContain("derivation");
      expect(result.message).toContain("additional properties");
    }
  });

  it("repairs a schema-invalid current v2 while retaining its exact bytes", async () => {
    const cwd = repoWithSession("g", "n", v2WithExtraDerivationMetadata, notesYaml);
    writeSessionBrief(cwd);
    const session = join(cwd, ".interlock", "sessions", "g", "n");
    const current = join(session, "debrief.yaml");
    const candidate = join(session, "corrected.yaml");
    writeFileSync(candidate, v2Debrief);
    const original = readFileSync(current);

    expect((await validateDebrief(["g", "n"], { cwd })).exitCode).not.toBe(0);
    expect((await runDebriefRevise(["g", "n", "--from", candidate], { cwd })).exitCode).toBe(0);
    expect(readFileSync(current)).toEqual(Buffer.from(v2Debrief));
    const digest = createHash("sha256").update(original).digest("hex");
    expect(readFileSync(join(session, "revisions", `${digest}.yaml`))).toEqual(original);
    expect((await validateDebrief(["g", "n"], { cwd })).exitCode).toBe(0);
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
