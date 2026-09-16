import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runDebriefPreview } from "../../src/debrief/preview.ts";
import { run } from "../../src/main.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.unstubAllGlobals();
});

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, { cwd, encoding: "utf-8", env: GIT_ENV });
}

function fixtureRepo(): { readonly cwd: string; readonly start: string; readonly head: string } {
  directory = mkdtempSync(join(runsRoot, "preview-"));
  git(["-c", "init.defaultBranch=main", "init", "--quiet"], directory);
  mkdirSync(join(directory, ".interlock"), { recursive: true });
  writeFileSync(join(directory, "AGENTS.md"), "## Vocabulary\n\n| term | means |\n| --- | --- |\n");
  git(["add", "-A"], directory);
  git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "root"], directory);
  const start = git(["rev-parse", "HEAD"], directory).trim();
  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(join(directory, "src", "widget.ts"), "export interface Widget {}\n");
  writeFileSync(join(directory, "src", "other.ts"), "export const other = true;\n");
  git(["add", "-A"], directory);
  git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "widget"], directory);
  return { cwd: directory, start, head: git(["rev-parse", "HEAD"], directory).trim() };
}

function candidate(
  start: string,
  head: string,
  claims: readonly string[],
  derivation = ["  kind: agent", "  runtime: codex", "  model: gpt-5.6-terra"],
): string {
  return [
    "interlock: debrief@v2",
    "graph: g",
    "node: n",
    "role: worker",
    `graph_base_sha: ${start}`,
    `session_start_sha: ${start}`,
    `head_sha: ${head}`,
    "derivation:",
    ...derivation,
    ...claims,
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function writeCandidate(cwd: string, content: string): string {
  const path = join(cwd, "candidate.yaml");
  writeFileSync(path, content);
  return path;
}

describe("runDebriefPreview", () => {
  it("routes the preview command and refuses invalid arguments", async () => {
    const result = await run(["debrief", "preview"]);
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("interlock debrief preview");
  });

  it("refuses missing, malformed, and schema-invalid candidates", async () => {
    const { cwd, start, head } = fixtureRepo();
    const missing = await runDebriefPreview(["--file", "missing.yaml"], { cwd });
    expect(missing.exitCode).toBe(1);
    expect(missing.message).toContain("missing.yaml");

    const path = writeCandidate(cwd, "interlock: debrief@v2\nnot: [yaml\n");
    const malformed = await runDebriefPreview(["--file", path], { cwd });
    expect(malformed.exitCode).toBe(1);

    writeFileSync(
      path,
      candidate(
        start,
        head,
        ["discoveries: []", "decisions: []"],
        [
          "  kind: agent",
          "  runtime: codex",
          "  model: gpt-5.6-terra",
          "  extra: rejected by schema",
        ],
      ),
    );
    const invalid = await runDebriefPreview(["--file", path], { cwd });
    expect(invalid.exitCode).toBe(1);
    expect(invalid.message).toContain("additional properties");
  });

  it("keeps legacy compatibility and reports that current marks require v2", async () => {
    const { cwd, start, head } = fixtureRepo();
    const path = writeCandidate(
      cwd,
      [
        "interlock: debrief@v1",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${start}`,
        `session_start_sha: ${start}`,
        `head_sha: ${head}`,
        "derivation:",
        "  kind: agent",
        "  runtime: codex",
        "  model: gpt-5.6-terra",
        "discoveries: []",
        "decisions: []",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await runDebriefPreview(["--file", path], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("candidate preview");
    expect(result.message).toContain("current marks require debrief@v2");
  });

  it("refuses a declared source range that cannot be verified", async () => {
    const { cwd, head } = fixtureRepo();
    const path = writeCandidate(
      cwd,
      candidate("a".repeat(40), head, ["discoveries: []", "decisions: []"]),
    );
    const result = await runDebriefPreview(["--file", path], { cwd });
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("is not a range in this repository's history");
  });

  it("shows a missing-quotation exclusion and the corrected rooted discovery", async () => {
    const { cwd, start, head } = fixtureRepo();
    const path = writeCandidate(
      cwd,
      candidate(start, head, [
        "discoveries:",
        "  - id: d1",
        "    what: widget export exists",
        "    found_at: 'src/widget.ts:1'",
        "    mattered_because: it is a fixture",
        "decisions: []",
      ]),
    );
    const missingQuote = await runDebriefPreview(["--file", path], { cwd });
    expect(missingQuote.exitCode).toBe(0);
    expect(missingQuote.message).toContain("requires exactly one separate nonblank quotation");
    expect(missingQuote.message).toContain("excluded: no hypothesis was translated");

    writeFileSync(
      path,
      candidate(start, head, [
        "discoveries:",
        "  - id: d1",
        "    what: widget export exists",
        "    found_at: 'src/widget.ts:1 \"export interface Widget\"'",
        "    mattered_because: it is a fixture",
        "decisions: []",
      ]),
    );
    const corrected = await runDebriefPreview(["--file", path], { cwd });
    expect(corrected.exitCode).toBe(0);
    expect(corrected.message).toContain("discovery d1:");
    expect(corrected.message).toContain("rooted: src/widget.ts");
    expect(corrected.message).toContain("included hypothesis scope: path src/widget.ts");
  });

  it("keeps duplicate prose associated by ID and reports fallback, applicability, and unrooted exclusions", async () => {
    const { cwd, start, head } = fixtureRepo();
    writeFileSync(
      join(cwd, ".interlock", "config.yaml"),
      "interlock: config@v0\nsubstrate:\n  address: none\n",
    );
    const canonical = join(cwd, ".interlock", "sessions", "g", "n", "debrief.yaml");
    mkdirSync(join(cwd, ".interlock", "sessions", "g", "n"), { recursive: true });
    writeFileSync(canonical, "canonical bytes remain private to filing\n");
    const path = writeCandidate(
      cwd,
      candidate(start, head, [
        "discoveries:",
        "  - id: d3",
        "    what: duplicate statement",
        "    found_at: missing.ts",
        "    mattered_because: test exclusion",
        "    applies_to: { kind: path, path: src/widget.ts }",
        "decisions:",
        "  - id: c1",
        "    what: duplicate statement",
        "    because: test fallback",
        "    rests_on: []",
        "    hunks: [src/widget.ts:1, src/other.ts:1]",
        "  - id: c2",
        "    what: duplicate statement",
        "    because: test applicability",
        "    rests_on: []",
        "    hunks: [src/widget.ts:1]",
        "    applies_to: { kind: repository }",
      ]),
    );
    const before = readFileSync(path);
    const canonicalBefore = readFileSync(canonical);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const result = await runDebriefPreview(["--file", "candidate.yaml"], { cwd });
    const c1 = result.message.match(/decision c1:[\s\S]*?(?=decision c2:)/)?.[0];
    const c2 = result.message.match(/decision c2:[\s\S]*?(?=discovery d3:)/)?.[0];
    const d3 = result.message.match(/discovery d3:[\s\S]*/)?.[0];
    expect(result.exitCode).toBe(0);
    expect(c1).toContain("applies_to: omitted");
    expect(c1).toContain("included hypothesis scope: repository");
    expect(c1).toContain("scope gap: decision c1 scope");
    expect(c2).toContain("applies_to: repository");
    expect(c2).toContain("included hypothesis scope: repository");
    expect(d3).toContain("applies_to: path src/widget.ts");
    expect(d3).toContain("unrooted:");
    expect(d3).toContain("excluded: no hypothesis was translated");
    expect(readFileSync(path)).toEqual(before);
    expect(readFileSync(canonical)).toEqual(canonicalBefore);
    expect(existsSync(join(cwd, ".interlock", "ledger", "journal.jsonl"))).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports no claims without turning that authoring state into a refusal", async () => {
    const { cwd, start, head } = fixtureRepo();
    const path = writeCandidate(cwd, candidate(start, head, ["discoveries: []", "decisions: []"]));
    const result = await runDebriefPreview(["--file", path], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("claims: none");
    expect(result.message).toContain(`declared source range: ${start}..${head}`);
  });
});
