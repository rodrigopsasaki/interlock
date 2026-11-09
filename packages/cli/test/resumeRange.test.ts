import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envelopeFor, type LedgerEvent, outcome, sessionRuntime } from "ledger";
import { findInheritedSessionStart } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit, initFixtureRepository } from "../../../test/support/gitFixture.ts";
import { runDebriefPrepare } from "../src/debrief/derived.ts";
import { slowIntegration } from "./support/slowIntegration.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) execFileSync("rm", ["-r", directory]);
  directory = undefined;
});

const graph = "g";
const node = "n";
const graphBasePlaceholder = "a".repeat(40);

function git(root: string, args: readonly string[]): string {
  return fixtureGit(args, { cwd: root }).trim();
}

function commit(root: string, message: string): string {
  git(root, ["add", "-A"]);
  git(root, ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function brief(session: string, graphBaseSha: string): string {
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
    `graph_base_sha: ${graphBaseSha}`,
    `session: ${session}`,
    "---",
    "",
  ].join("\n");
}

function started(
  session: string,
  graphBaseSha: string,
  inheritedStartSha?: string,
  predecessorSession?: string,
): LedgerEvent {
  return {
    kind: "session-started",
    session: { id: session, node: { graph, id: node }, runtime: sessionRuntime.unknown() },
    brief: { graph, node, role: "worker", acceptance: "work", gates: [], scope: [] },
    graphBaseSha,
    ...(inheritedStartSha === undefined ? {} : { inheritedStartSha }),
    ...(predecessorSession === undefined ? {} : { predecessorSession }),
  };
}

function writeJournal(root: string, events: readonly LedgerEvent[]): void {
  const journal = join(root, ".interlock", "ledger");
  mkdirSync(journal, { recursive: true });
  writeFileSync(
    join(journal, "journal.jsonl"),
    events.map((event) => `${JSON.stringify(envelopeFor(event))}\n`).join(""),
  );
}

interface Fixture {
  readonly root: string;
  readonly graphBase: string;
  readonly aStart: string;
  readonly aHead: string;
  readonly bStart: string;
  readonly events: LedgerEvent[];
}

function fixture(withDebrief = false): Fixture {
  directory = mkdtempSync(join(runsRoot, "resume-range-"));
  initFixtureRepository(directory, { defaultBranch: "main" });
  git(directory, ["config", "user.name", "fixture"]);
  git(directory, ["config", "user.email", "fixture@example.test"]);
  const sessionPath = join(directory, ".interlock", "sessions", graph, node);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  mkdirSync(sessionPath, { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", `${graph}.yaml`),
    [
      "interlock: graph@v0",
      `id: ${graph}`,
      "gates: []",
      "nodes:",
      `  - id: ${node}`,
      "    acceptance: work",
      "    depends_on: []",
      "    gates: []",
      "",
    ].join("\n"),
  );
  writeFileSync(join(sessionPath, "brief.md"), brief("A", graphBasePlaceholder));
  const graphBase = commit(directory, "base");
  git(directory, ["checkout", "-b", `graph/${graph}/${node}`]);
  writeFileSync(join(sessionPath, "brief.md"), brief("A", graphBase));
  const aStart = commit(directory, "chore: write A brief");
  writeFileSync(join(directory, "a.ts"), "export const a = true;\n");
  const aHead = commit(directory, "feat: A code\n\nAttempt: A");
  if (withDebrief) {
    writeFileSync(join(sessionPath, "debrief.yaml"), "interlock: debrief@v1\n");
    commit(directory, "chore: file A debrief\n\nAttempt: A");
  }
  writeFileSync(join(sessionPath, "brief.md"), brief("B", graphBase));
  const bStart = commit(directory, "chore: write B brief");
  const events = [started("A", graphBase)];
  writeJournal(directory, events);
  return { root: directory, graphBase, aStart, aHead, bStart, events };
}

function addBCode(source: Fixture, extra: readonly LedgerEvent[] = []): void {
  writeFileSync(join(source.root, "b.ts"), "export const b = true;\n");
  commit(source.root, "feat: B code\n\nAttempt: B");
  const b = started("B", source.graphBase, source.aStart, "A");
  source.events.push(...extra, b);
  writeJournal(source.root, source.events);
}

function prepare(root: string): string {
  const candidate = join(root, ".interlock", "sessions", graph, node, "candidate.yaml");
  return candidate;
}

describe("resumed debrief ranges", () => {
  slowIntegration(
    "keeps the predecessor code and writes the runner provenance",
    {
      budgetMs: 15_000,
      reason: "integrates Git ancestry, historical session bytes and runner provenance trailers",
    },
    async () => {
      const source = fixture();
      addBCode(source);
      const runnerDecision = findInheritedSessionStart(
        source.root,
        [source.events[0]].filter((event): event is LedgerEvent => event !== undefined),
        graph,
        node,
        source.graphBase,
        source.aHead,
        "runner-session-B",
      );
      expect(runnerDecision).toEqual({
        kind: "inherited",
        inheritedStartSha: source.aStart,
        predecessorSession: "A",
      });
      const head = git(source.root, ["rev-parse", "HEAD"]);
      const current = source.events.find(
        (event): event is Extract<LedgerEvent, { readonly kind: "session-started" }> =>
          event.kind === "session-started" && event.session.id === "B",
      );
      if (current === undefined) throw new Error("fixture did not append B session");
      const inherited = findInheritedSessionStart(
        source.root,
        source.events,
        graph,
        node,
        source.graphBase,
        head,
        "B",
        current,
      );
      expect(inherited).toEqual({
        kind: "inherited",
        inheritedStartSha: source.aStart,
        predecessorSession: "A",
      });
      const candidate = prepare(source.root);
      const result = await runDebriefPrepare(
        [graph, node, "--to", candidate, "--agent-runtime", "fixture", "--agent-model", "model"],
        { cwd: source.root },
      );
      expect(result.exitCode, result.message).toBe(0);
      expect(readFileSync(candidate, "utf-8")).toContain(`session_start_sha: ${source.aStart}`);
    },
  );

  slowIntegration(
    "carries the first start through a chain while both attempts stay open",
    {
      budgetMs: 15_000,
      reason: "integrates chained Git session ancestry and historical runner provenance bytes",
    },
    async () => {
      const source = fixture();
      addBCode(source);
      writeFileSync(
        join(source.root, ".interlock", "sessions", graph, node, "brief.md"),
        brief("C", source.graphBase),
      );
      const cStart = commit(source.root, "chore: write C brief");
      writeFileSync(join(source.root, "c.ts"), "export const c = true;\n");
      commit(source.root, "feat: C code\n\nAttempt: C");
      source.events.push(started("C", source.graphBase, source.aStart, "B"));
      writeJournal(source.root, source.events);
      const candidate = prepare(source.root);
      const result = await runDebriefPrepare(
        [graph, node, "--to", candidate, "--agent-runtime", "fixture", "--agent-model", "model"],
        { cwd: source.root },
      );
      expect(result.exitCode, result.message).toBe(0);
      expect(readFileSync(candidate, "utf-8")).toContain(`session_start_sha: ${source.aStart}`);
      expect(cStart).not.toBe(source.bStart);
    },
  );

  it("keeps its own start when the predecessor has a debrief or outcome", async () => {
    const source = fixture(true);
    addBCode(source);
    const debriefCandidate = prepare(source.root);
    const debriefResult = await runDebriefPrepare(
      [
        graph,
        node,
        "--to",
        debriefCandidate,
        "--agent-runtime",
        "fixture",
        "--agent-model",
        "model",
      ],
      { cwd: source.root },
    );
    expect(debriefResult.exitCode, debriefResult.message).toBe(0);
    expect(readFileSync(debriefCandidate, "utf-8")).toContain(
      `session_start_sha: ${source.bStart}`,
    );
  });

  it("keeps its own start when an outcome closes the predecessor", async () => {
    const source = fixture();
    const outcomeEvent: LedgerEvent = {
      kind: "outcome-set",
      node: { graph, id: node },
      outcome: outcome.cancelled([], "fixture", "held"),
    };
    source.events.push(outcomeEvent);
    addBCode(source);
    const candidate = prepare(source.root);
    const result = await runDebriefPrepare(
      [graph, node, "--to", candidate, "--agent-runtime", "fixture", "--agent-model", "model"],
      { cwd: source.root },
    );
    expect(result.exitCode, result.message).toBe(0);
    expect(readFileSync(candidate, "utf-8")).toContain(`session_start_sha: ${source.bStart}`);
  });
});
