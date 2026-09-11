import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runInterlockVerify } from "../src/verify.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    },
  });
}

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const AGENTS_MD = [
  "## Vocabulary",
  "",
  "| term | means |",
  "| --- | --- |",
  "| widget | A thing. |",
  "",
  "## Next",
  "",
].join("\n");

function writeSessionDebrief(repoRoot: string, yaml: string): void {
  const dir = join(repoRoot, ".interlock", "sessions", "g", "n");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "debrief.yaml"), yaml);
}

function v2Debrief(
  sessionStartSha: string,
  headSha: string,
  extra: string,
): string {
  return [
    "interlock: debrief@v2",
    "graph: g",
    "node: n",
    "role: worker",
    `graph_base_sha: ${sessionStartSha}`,
    `session_start_sha: ${sessionStartSha}`,
    `head_sha: ${headSha}`,
    "derivation:",
    "  kind: agent",
    "  runtime: claude-code",
    "  model: claude-sonnet-5",
    extra,
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

function fixtureRepo(): {
  readonly dir: string;
  readonly from: string;
  readonly to: string;
} {
  directory = mkdtempSync(join(runsRoot, "verify-"));
  git(["-c", "init.defaultBranch=main", "init", "--quiet"], directory);
  writeFileSync(join(directory, "AGENTS.md"), AGENTS_MD);
  git(["add", "-A"], directory);
  git(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "root"],
    directory,
  );
  const from = git(["rev-parse", "HEAD"], directory).trim();

  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(
    join(directory, "src/widget.ts"),
    ["export interface Widget {", "  readonly id: string;", "}", ""].join("\n"),
  );
  git(["add", "-A"], directory);
  git(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "add widget"],
    directory,
  );
  const to = git(["rev-parse", "HEAD"], directory).trim();

  mkdirSync(join(directory, ".interlock"), { recursive: true });
  return { dir: directory, from, to };
}

describe("runInterlockVerify", () => {
  it("refuses with no arguments, naming the expected form", async () => {
    const result = await runInterlockVerify([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock verify");
  });

  it("gives the exact sentence when no debrief was filed", async () => {
    directory = mkdtempSync(join(runsRoot, "verify-"));
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    const result = await runInterlockVerify(["g", "n"], { cwd: directory });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "no debrief was filed for g/n; the session is interrupted.",
    );
  });

  it("refuses a malformed debrief with the shape refusal's own sentence", async () => {
    directory = mkdtempSync(join(runsRoot, "verify-"));
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    writeSessionDebrief(directory, "not: yaml: at: all: :::");
    const result = await runInterlockVerify(["g", "n"], { cwd: directory });
    expect(result.exitCode).not.toBe(0);
  });

  it("reports a legacy debrief as a sentence, without computing marks", async () => {
    directory = mkdtempSync(join(runsRoot, "verify-"));
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    const sha = "a".repeat(40);
    writeSessionDebrief(
      directory,
      [
        "interlock: debrief@v1",
        "graph: g",
        "node: n",
        "role: worker",
        `graph_base_sha: ${sha}`,
        `session_start_sha: ${sha}`,
        `head_sha: ${sha}`,
        "derivation:",
        "  kind: agent",
        "  runtime: claude-code",
        "  model: claude-sonnet-5",
        "discoveries: []",
        "decisions: []",
        "gates_run_by_agent: []",
        "open: []",
        "",
      ].join("\n"),
    );
    const result = await runInterlockVerify(["g", "n"], { cwd: directory });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("g/n is debrief@v1; marks require debrief@v2.");
  });

  it("refuses a v2 debrief whose range is not in this repository's history", async () => {
    directory = mkdtempSync(join(runsRoot, "verify-"));
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    const sha = "c".repeat(40);
    writeSessionDebrief(
      directory,
      v2Debrief(sha, sha, ["discoveries: []", "decisions: []"].join("\n")),
    );
    const result = await runInterlockVerify(["g", "n"], { cwd: directory });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain(
      "is not a range in this repository's history.",
    );
  });

  it("verifies a v2 debrief, rendering the marks position", async () => {
    const { dir, from, to } = fixtureRepo();
    writeSessionDebrief(
      dir,
      v2Debrief(
        from,
        to,
        [
          "discoveries: []",
          "decisions:",
          "  - id: c1",
          "    what: added Widget",
          "    because: test",
          "    rests_on: []",
          '    hunks: ["src/widget.ts:1-3"]',
        ].join("\n"),
      ),
    );
    const result = await runInterlockVerify(["g", "n"], { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(
      /^rooted 1, unrooted 0, unexplained 0, gap 0/,
    );
  });
});
