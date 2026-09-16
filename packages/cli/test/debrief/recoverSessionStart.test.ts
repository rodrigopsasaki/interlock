import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { debriefRevisionsDirectory, reviseDebrief } from "debrief";
import { afterEach, describe, expect, it } from "vitest";
import { recoverSessionStart } from "../../src/debrief/recoverSessionStart.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) execFileSync("rm", ["-r", directory]);
  directory = undefined;
});

const GRAPH = "g";
const NODE = "n";
const SESSION = "session-1";
const BASE_PLACEHOLDER = "a".repeat(40);

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf-8" }).trim();
}

function commit(root: string, message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function brief(graphBaseSha: string, session = SESSION, body = "start\n"): string {
  return [
    "---",
    "interlock: brief@v1",
    `graph: ${GRAPH}`,
    `node: ${NODE}`,
    "role: worker",
    "gates: []",
    "scope: []",
    "substrate:",
    "  address: none",
    `graph_base_sha: ${graphBaseSha}`,
    `session: ${session}`,
    "---",
    body,
  ].join("\n");
}

function debrief(start: string, head: string, what: string): string {
  return [
    "interlock: debrief@v2",
    `graph: ${GRAPH}`,
    `node: ${NODE}`,
    "role: worker",
    `graph_base_sha: ${BASE_PLACEHOLDER}`,
    `session_start_sha: ${start}`,
    `head_sha: ${head}`,
    "derivation:",
    "  kind: agent",
    "  runtime: codex",
    "  model: gpt-5.6-terra",
    "discoveries: []",
    "decisions:",
    "  - id: c1",
    `    what: ${what}`,
    "    because: notes:1",
    "    rests_on: []",
    "    hunks: []",
    "gates_run_by_agent: []",
    "open: []",
    "",
  ].join("\n");
}

interface Fixture {
  readonly root: string;
  readonly session: string;
  readonly current: string;
  readonly candidate: string;
  readonly base: string;
  readonly start: string;
  readonly head: string;
}

function event(base: string, session = SESSION): string {
  return `${JSON.stringify({
    interlock: "event@v5",
    kind: "session-started",
    session: { id: session, node: { graph: GRAPH, id: NODE } },
    brief: { graph: GRAPH, node: NODE, role: "worker", acceptance: "work", gates: [], scope: [] },
    graphBaseSha: base,
  })}\n`;
}

function writeStarted(root: string, base: string, session = SESSION, append = false): void {
  const journal = join(root, ".interlock", "ledger");
  mkdirSync(journal, { recursive: true });
  const path = join(journal, "journal.jsonl");
  if (append) appendFileSync(path, event(base, session));
  else writeFileSync(path, event(base, session));
}

function fixture(): Fixture {
  directory = mkdtempSync(join(runsRoot, "recover-session-start-"));
  git(directory, ["-c", "init.defaultBranch=main", "init", "--quiet"]);
  git(directory, ["config", "user.name", "fixture"]);
  git(directory, ["config", "user.email", "fixture@example.test"]);
  const session = join(directory, ".interlock", "sessions", GRAPH, NODE);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(session, { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${GRAPH}.yaml`),
    [
      "interlock: graph@v0",
      `id: ${GRAPH}`,
      "gates: []",
      "nodes:",
      `  - id: ${NODE}`,
      "    acceptance: work",
      "    depends_on: []",
      "    gates: []",
      "",
    ].join("\n"),
  );
  writeFileSync(join(session, "brief.md"), brief(BASE_PLACEHOLDER, "authored-brief", "before\n"));
  const base = commit(directory, "base");
  writeFileSync(join(session, "brief.md"), brief(base));
  const start = commit(directory, "start");
  writeFileSync(join(directory, "later.txt"), "later\n");
  const head = commit(directory, "later");
  writeStarted(directory, base);
  const current = join(session, "debrief.yaml");
  const candidate = join(session, "candidate.yaml");
  writeFileSync(current, debrief("d".repeat(40), head, "original").replace(BASE_PLACEHOLDER, base));
  writeFileSync(candidate, debrief(start, head, "corrected").replace(BASE_PLACEHOLDER, base));
  return { root: directory, session, current, candidate, base, start, head };
}

function recover(source: Fixture) {
  return reviseDebrief(source.root, GRAPH, NODE, source.candidate, { recoverSessionStart });
}

function authoredBytes(source: Fixture): readonly Buffer[] {
  return [
    readFileSync(join(source.session, "brief.md")),
    readFileSync(source.current),
    readFileSync(source.candidate),
  ];
}

function expectUnchanged(source: Fixture, before: readonly Buffer[]): void {
  expect(authoredBytes(source)).toEqual(before);
}

describe("recover session start", () => {
  it("recovers only the earliest byte-identical session start through the revision seam", async () => {
    const source = fixture();
    writeStarted(source.root, source.base, "foreign", true);

    const result = await recover(source);

    expect(isOk(result)).toBe(true);
    if (!isOk(result) || result.value.kind !== "selected") return;
    expect(readFileSync(source.current)).toEqual(readFileSync(source.candidate));
    const digest = createHash("sha256")
      .update(
        debrief("d".repeat(40), source.head, "original").replace(BASE_PLACEHOLDER, source.base),
      )
      .digest("hex");
    expect(
      readFileSync(
        join(debriefRevisionsDirectory(source.root, GRAPH, NODE), `${digest}.yaml`),
      ).toString("utf-8"),
    ).toContain("original");
  });

  it("refuses later arbitrary commits, committed brief edits, and missing or duplicate starts", async () => {
    const source = fixture();
    writeFileSync(
      source.candidate,
      debrief(source.head, source.head, "later").replace(BASE_PLACEHOLDER, source.base),
    );
    const laterBefore = authoredBytes(source);
    const later = await recover(source);
    expect(isErr(later)).toBe(true);
    expectUnchanged(source, laterBefore);

    writeFileSync(
      source.candidate,
      debrief(source.start, source.base, "wrong head").replace(BASE_PLACEHOLDER, source.base),
    );
    const headBefore = authoredBytes(source);
    const wrongHead = await recover(source);
    expect(isErr(wrongHead)).toBe(true);
    expectUnchanged(source, headBefore);

    writeFileSync(join(source.session, "brief.md"), brief(source.base, SESSION, "changed\n"));
    const changedHead = commit(source.root, "change brief");
    writeFileSync(
      source.candidate,
      debrief(source.start, changedHead, "corrected").replace(BASE_PLACEHOLDER, source.base),
    );
    const changedBefore = authoredBytes(source);
    const changed = await recover(source);
    expect(isErr(changed)).toBe(true);
    expectUnchanged(source, changedBefore);

    writeStarted(source.root, source.base, "foreign");
    const missingBefore = authoredBytes(source);
    const missing = await recover(source);
    expect(isErr(missing)).toBe(true);
    expectUnchanged(source, missingBefore);

    writeStarted(source.root, source.base);
    writeStarted(source.root, source.base, SESSION, true);
    const duplicateBefore = authoredBytes(source);
    const duplicate = await recover(source);
    expect(isErr(duplicate)).toBe(true);
    expectUnchanged(source, duplicateBefore);
  });

  it("refuses missing or mismatched graph-base evidence and a torn journal", async () => {
    const source = fixture();
    writeFileSync(
      join(source.root, ".interlock", "ledger", "journal.jsonl"),
      event(source.base).replace(`,"graphBaseSha":"${source.base}"`, ""),
    );
    const missingBaseBefore = authoredBytes(source);
    const missingBase = await recover(source);
    expect(isErr(missingBase)).toBe(true);
    expectUnchanged(source, missingBaseBefore);

    writeStarted(source.root, "f".repeat(40));
    const mismatchedBaseBefore = authoredBytes(source);
    const mismatchedBase = await recover(source);
    expect(isErr(mismatchedBase)).toBe(true);
    expectUnchanged(source, mismatchedBaseBefore);

    writeFileSync(
      join(source.root, ".interlock", "ledger", "journal.jsonl"),
      `${event(source.base)}{"interlock"`,
    );
    const tornBefore = authoredBytes(source);
    const torn = await recover(source);
    expect(isErr(torn)).toBe(true);
    expectUnchanged(source, tornBefore);
  });
});
