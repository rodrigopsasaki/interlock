import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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

function brief(base: string, nodeId = node): string {
  return [
    "---",
    "interlock: brief@v1",
    `graph: ${graph}`,
    `node: ${nodeId}`,
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

function started(base: string, nodeId = node, graphBaseSha = base): string {
  return `${JSON.stringify({
    interlock: "event@v5",
    kind: "session-started",
    session: { id: session, node: { graph, id: nodeId } },
    brief: { graph, node: nodeId, role: "worker", acceptance: "work", gates: [], scope: [] },
    graphBaseSha,
  })}\n`;
}

function fixture(nodeId = node): { readonly root: string; readonly sessionPath: string; readonly base: string; readonly start: string } {
  directory = mkdtempSync(join(runsRoot, "derived-"));
  git(directory, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
  git(directory, ["config", "user.name", "fixture"]);
  git(directory, ["config", "user.email", "fixture@example.test"]);
  const sessionPath = join(directory, ".interlock", "sessions", graph, nodeId);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(sessionPath, { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${graph}.yaml`),
    ["interlock: graph@v0", `id: ${graph}`, "gates: []", "nodes:", `  - id: ${nodeId}`, "    acceptance: work", "    depends_on: []", "    gates: []", ""].join("\n"),
  );
  writeFileSync(join(sessionPath, "brief.md"), brief("a".repeat(40), nodeId));
  const base = commit(directory, "base");
  writeFileSync(join(sessionPath, "brief.md"), brief(base, nodeId));
  const start = commit(directory, "start");
  mkdirSync(join(directory, ".interlock", "ledger"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "ledger", "journal.jsonl"), started(base, nodeId));
  return { root: directory, sessionPath, base, start };
}

function prepareArgs(candidate: string, nodeId = node): readonly string[] {
  return [graph, nodeId, "--to", candidate, "--agent-runtime", "codex", "--agent-model", "gpt-5.6-terra"];
}

describe("interlock debrief derived handoff", () => {
  it("derives the first candidate and files it without an archive", async () => {
    const source = fixture();
    const candidate = join(source.sessionPath, "candidate.yaml");

    const prepared = await runDebriefPrepare(prepareArgs(candidate), { cwd: source.root });

    expect(prepared.exitCode).toBe(0);
    const bytes = readFileSync(candidate, "utf-8");
    expect(bytes).toContain(`graph: ${graph}`);
    expect(bytes).toContain(`node: ${node}`);
    expect(bytes).toContain("role: worker");
    expect(bytes).toContain(`graph_base_sha: ${source.base}`);
    expect(bytes).toContain(`session_start_sha: ${source.start}`);
    expect(bytes).toContain(`head_sha: ${source.start}`);
    expect(bytes).toContain("runtime: codex");
    expect(bytes).toContain("gates_run_by_agent: []");
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

  it("supports safe nested worker-node custody and the explicit human authorship form", async () => {
    const planningNode = "plan/g";
    const source = fixture(planningNode);
    const candidate = join(source.sessionPath, "human.yaml");
    const prepared = await runDebriefPrepare([graph, planningNode, "--to", candidate, "--human", "Ada"], { cwd: source.root });

    expect(prepared.exitCode).toBe(0);
    expect(readFileSync(candidate, "utf-8")).toContain("who: Ada");
    writeFileSync(candidate, readFileSync(candidate, "utf-8").replace("who: Ada", "who: ''"));
    expect((await runDebriefFileDerived([graph, planningNode, "--from", candidate], { cwd: source.root })).exitCode).not.toBe(0);
    writeFileSync(candidate, readFileSync(candidate, "utf-8").replace("who: ''", "who: Ada"));
    expect((await runDebriefFileDerived([graph, planningNode, "--from", candidate], { cwd: source.root })).exitCode).toBe(0);
    const mixed = await runDebriefPrepare([...prepareArgs(join(source.sessionPath, "mixed.yaml"), planningNode), "--human", "Ada"], { cwd: source.root });
    expect(mixed.exitCode).not.toBe(0);
  });

  it("refuses blank edited authorship and preserves distinct candidate bytes after filing", async () => {
    const source = fixture();
    const candidate = join(source.sessionPath, "candidate.yaml");
    await runDebriefPrepare(prepareArgs(candidate), { cwd: source.root });
    writeFileSync(candidate, readFileSync(candidate, "utf-8").replace("runtime: codex", "runtime: ''"));
    expect((await runDebriefFileDerived([graph, node, "--from", candidate], { cwd: source.root })).exitCode).not.toBe(0);

    writeFileSync(candidate, readFileSync(candidate, "utf-8").replace("runtime: ''", "runtime: codex"));
    expect((await runDebriefFileDerived([graph, node, "--from", candidate], { cwd: source.root })).exitCode).toBe(0);
    const canonical = join(source.sessionPath, "debrief.yaml");
    const canonicalBytes = readFileSync(canonical);
    writeFileSync(candidate, `${readFileSync(candidate, "utf-8")}open:\n  - changed source\n`);
    expect(readFileSync(canonical)).toEqual(canonicalBytes);
  });

  it("refuses existing and canonical candidates plus symlink paths without writing", async () => {
    const source = fixture();
    const existing = join(source.sessionPath, "existing.yaml");
    writeFileSync(existing, "authored\n");
    expect((await runDebriefPrepare(prepareArgs(existing), { cwd: source.root })).exitCode).not.toBe(0);
    const canonical = join(source.sessionPath, "debrief.yaml");
    expect((await runDebriefPrepare(prepareArgs(canonical), { cwd: source.root })).exitCode).not.toBe(0);
    const linked = join(source.sessionPath, "linked.yaml");
    symlinkSync(existing, linked);
    expect((await runDebriefPrepare(prepareArgs(linked), { cwd: source.root })).exitCode).not.toBe(0);
    expect(readFileSync(existing, "utf-8")).toBe("authored\n");
  });

  it("refuses missing, duplicate, mismatched, and altered identity evidence before candidate creation", async () => {
    const source = fixture();
    const journal = join(source.root, ".interlock", "ledger", "journal.jsonl");
    writeFileSync(journal, started(source.base, "foreign"));
    expect((await runDebriefPrepare(prepareArgs(join(source.sessionPath, "missing.yaml")), { cwd: source.root })).exitCode).not.toBe(0);
    writeFileSync(journal, `${started(source.base)}${started(source.base)}`);
    expect((await runDebriefPrepare(prepareArgs(join(source.sessionPath, "duplicate.yaml")), { cwd: source.root })).exitCode).not.toBe(0);
    writeFileSync(journal, started(source.base, node, "f".repeat(40)));
    expect((await runDebriefPrepare(prepareArgs(join(source.sessionPath, "mismatch.yaml")), { cwd: source.root })).exitCode).not.toBe(0);
    writeFileSync(journal, started(source.base));
    appendFileSync(join(source.sessionPath, "brief.md"), "changed\n");
    expect((await runDebriefPrepare(prepareArgs(join(source.sessionPath, "altered.yaml")), { cwd: source.root })).exitCode).not.toBe(0);
    expect(existsSync(join(source.sessionPath, "missing.yaml"))).toBe(false);
    expect(existsSync(join(source.sessionPath, "duplicate.yaml"))).toBe(false);
    expect(existsSync(join(source.sessionPath, "mismatch.yaml"))).toBe(false);
    expect(existsSync(join(source.sessionPath, "altered.yaml"))).toBe(false);
  });
});
