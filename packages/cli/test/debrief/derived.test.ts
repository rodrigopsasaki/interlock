import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDebriefFileDerived, runDebriefPrepare } from "../../src/debrief/derived.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) execFileSync("rm", ["-r", directory]);
  directory = undefined;
});

const graph = "g";
const node = "n";
const session = "session-1";

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
}

function commit(root: string, message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function brief(base: string): string {
  return [
    "---",
    "interlock: brief@v1",
    `graph: ${graph}`,
    `node: ${node}`,
    "role: worker",
    "gates: []",
    "scope: []",
    "substrate:",
    "  address: none",
    `graph_base_sha: ${base}`,
    `session: ${session}`,
    "---",
    "",
  ].join("\n");
}

function started(base: string): string {
  return `${JSON.stringify({
    interlock: "event@v5",
    kind: "session-started",
    session: { id: session, node: { graph, id: node } },
    brief: { graph, node, role: "worker", acceptance: "work", gates: [], scope: [] },
    graphBaseSha: base,
  })}\n`;
}

function fixture(): { readonly root: string; readonly sessionPath: string; readonly head: string } {
  directory = mkdtempSync(join(runsRoot, "derived-"));
  git(directory, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
  git(directory, ["config", "user.name", "fixture"]);
  git(directory, ["config", "user.email", "fixture@example.test"]);
  const sessionPath = join(directory, ".interlock", "sessions", graph, node);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(sessionPath, { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${graph}.yaml`),
    ["interlock: graph@v0", `id: ${graph}`, "gates: []", "nodes:", `  - id: ${node}`, "    acceptance: work", "    depends_on: []", "    gates: []", ""].join("\n"),
  );
  writeFileSync(join(sessionPath, "brief.md"), brief("a".repeat(40)));
  const base = commit(directory, "base");
  writeFileSync(join(sessionPath, "brief.md"), brief(base));
  const head = commit(directory, "start");
  mkdirSync(join(directory, ".interlock", "ledger"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "ledger", "journal.jsonl"), started(base));
  return { root: directory, sessionPath, head };
}

function prepareArgs(candidate: string): readonly string[] {
  return [graph, node, "--to", candidate, "--agent-runtime", "codex", "--agent-model", "gpt-5.6-terra"];
}

describe("interlock debrief derived handoff", () => {
  it("derives the first candidate and files it without an archive", async () => {
    const source = fixture();
    const candidate = join(source.sessionPath, "candidate.yaml");

    const prepared = await runDebriefPrepare(prepareArgs(candidate), { cwd: source.root });

    expect(prepared.exitCode).toBe(0);
    const bytes = readFileSync(candidate, "utf-8");
    expect(bytes).toContain(`head_sha: ${source.head}`);
    expect(bytes).toContain("runtime: codex");
    const filed = await runDebriefFileDerived([graph, node, "--from", candidate], { cwd: source.root });
    expect(filed.exitCode).toBe(0);
    expect(readFileSync(join(source.sessionPath, "debrief.yaml"))).toEqual(readFileSync(candidate));
    expect(existsSync(join(source.sessionPath, "revisions"))).toBe(false);
  });

  it("refuses a concurrent canonical appearance without clobbering either authored file", async () => {
    const source = fixture();
    const candidate = join(source.sessionPath, "candidate.yaml");
    await runDebriefPrepare(prepareArgs(candidate), { cwd: source.root });
    const candidateBytes = readFileSync(candidate);
    const current = join(source.sessionPath, "debrief.yaml");
    writeFileSync(current, "authored elsewhere\n");

    const filed = await runDebriefFileDerived([graph, node, "--from", candidate], { cwd: source.root });

    expect(filed.exitCode).not.toBe(0);
    expect(readFileSync(current, "utf-8")).toBe("authored elsewhere\n");
    expect(readFileSync(candidate)).toEqual(candidateBytes);
  });

  it("refuses a candidate after the source head changed and leaves it intact", async () => {
    const source = fixture();
    const candidate = join(source.sessionPath, "candidate.yaml");
    await runDebriefPrepare(prepareArgs(candidate), { cwd: source.root });
    const candidateBytes = readFileSync(candidate);
    writeFileSync(join(source.root, "source.ts"), "export {};\n");
    commit(source.root, "source change");

    const filed = await runDebriefFileDerived([graph, node, "--from", candidate], { cwd: source.root });

    expect(filed.exitCode).not.toBe(0);
    expect(readFileSync(candidate)).toEqual(candidateBytes);
    expect(existsSync(join(source.sessionPath, "debrief.yaml"))).toBe(false);
  });

  it("refuses an escaped preparation target before writing it", async () => {
    const source = fixture();
    const outside = join(source.root, "outside.yaml");

    const prepared = await runDebriefPrepare(prepareArgs(outside), { cwd: source.root });

    expect(prepared.exitCode).not.toBe(0);
    expect(existsSync(outside)).toBe(false);
  });
});
