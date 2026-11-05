import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type GitRun, type GitRunner, spawnedGit } from "face";

const GIT_ENV = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-c", "commit.gpgsign=false", ...args], {
    cwd: repo,
    encoding: "utf-8",
    env: GIT_ENV,
  }).trim();
}

export interface ClearedNode {
  readonly graph: string;
  readonly node: string;
  readonly session: string;
  readonly base: string;
  readonly head: string;
}

export interface LandedRepository {
  readonly root: string;
  readonly cleared: readonly ClearedNode[];
}

function landOnMain(root: string, path: string, content: string): { base: string; head: string } {
  const base = git(root, "rev-parse", "HEAD");
  const file = join(root, path);
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, content);
  git(root, "add", path);
  git(root, "commit", "--quiet", "-m", `feat: ${path}`);
  return { base, head: git(root, "rev-parse", "HEAD") };
}

export function landedRepository(
  runsRoot: string,
  graphs: Readonly<Record<string, readonly string[]>>,
): LandedRepository {
  mkdirSync(runsRoot, { recursive: true });
  const root = mkdtempSync(join(runsRoot, "landed-"));
  git(root, "init", "--quiet", "--initial-branch", "main");
  git(root, "commit", "--quiet", "--allow-empty", "-m", "fixture root");
  mkdirSync(join(root, ".interlock", "graphs"), { recursive: true });
  const cleared: ClearedNode[] = [];
  for (const [graph, nodes] of Object.entries(graphs)) {
    writeFileSync(
      join(root, ".interlock", "graphs", `${graph}.yaml`),
      [
        "interlock: graph@v0",
        `id: ${graph}`,
        "nodes:",
        ...nodes.flatMap((node) => [`  - id: ${node}`, "    depends_on: []"]),
        "",
      ].join("\n"),
    );
    for (const node of nodes) {
      const landed = landOnMain(root, `src/${graph}/${node}.txt`, `${graph} ${node}\n`);
      cleared.push({ graph, node, session: `s-${graph}-${node}`, ...landed });
    }
  }
  writeLandedJournal(root, cleared);
  return { root, cleared };
}

export function withNewHead(root: string, node: ClearedNode): ClearedNode {
  const branch = `rerun/${node.graph}/${node.node}`;
  git(root, "switch", "--quiet", "-c", branch, node.base);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", `${node.graph}-${node.node}-rerun.txt`), `${node.session}\n`);
  git(root, "add", "src");
  git(root, "commit", "--quiet", "-m", `feat: rerun ${node.node}`);
  const head = git(root, "rev-parse", "HEAD");
  git(root, "switch", "--quiet", "main");
  return { ...node, session: `${node.session}-head`, head };
}

export function withNewBase(node: ClearedNode, base: string): ClearedNode {
  return { ...node, session: `${node.session}-base`, base };
}

export function moveMain(root: string, path = "docs/elsewhere.md"): string {
  return landOnMain(root, path, `moved at ${git(root, "rev-parse", "HEAD")}\n`).head;
}

function clearedEvents(node: ClearedNode): readonly unknown[] {
  const at = { graph: node.graph, id: node.node };
  return [
    {
      interlock: "event@v6",
      kind: "session-started",
      session: {
        id: node.session,
        node: at,
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
      },
      brief: {
        graph: node.graph,
        node: node.node,
        role: "implementer",
        acceptance: "x",
        gates: [],
        scope: [],
      },
      graphBaseSha: node.base,
    },
    { interlock: "event@v4", kind: "lease-taken", node: at, session: node.session, expiry: 1 },
    {
      interlock: "event@v5",
      kind: "outcome-set",
      node: at,
      outcome: {
        kind: "cleared",
        receipts: [
          {
            id: `receipt-${node.session}`,
            gate: "test",
            commitSha: node.head,
            spend: { kind: "none" },
            duration: { kind: "measured", ms: 1 },
            derivation: { kind: "gate", gate: "test", version: "runner@0", runner: "fixture" },
            proof: { exitCode: 0, outputHash: "fixture" },
          },
        ],
      },
    },
  ];
}

export function writeLandedJournal(root: string, cleared: readonly ClearedNode[]): void {
  const graphs = [...new Set(cleared.map((node) => node.graph))];
  const events = [
    ...graphs.map((graph) => ({
      interlock: "event@v4",
      kind: "node-created",
      node: { graph, id: graph },
    })),
    ...cleared.map((node) => ({
      interlock: "event@v4",
      kind: "node-created",
      node: { graph: node.graph, id: node.node },
    })),
    ...cleared.flatMap(clearedEvents),
  ];
  mkdirSync(join(root, ".interlock", "ledger"), { recursive: true });
  writeFileSync(
    join(root, ".interlock", "ledger", "journal.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
}

export interface GitCall {
  readonly args: readonly string[];
  readonly input: string | undefined;
}

export interface CountingGit {
  readonly run: GitRunner;
  readonly calls: GitCall[];
  failNext(matches: (call: GitCall) => boolean): void;
}

const REFUSED: GitRun = { status: 128, stdout: "", stderr: "fatal: injected transient failure" };

export function countingGit(): CountingGit {
  const calls: GitCall[] = [];
  let failing: ((call: GitCall) => boolean) | undefined;
  return {
    calls,
    failNext(matches) {
      failing = matches;
    },
    run: async (repoRoot, args, input) => {
      const call = { args, input };
      calls.push(call);
      if (failing?.(call) === true) {
        failing = undefined;
        return REFUSED;
      }
      return spawnedGit(repoRoot, args, input);
    },
  };
}

export function isSnapshotRead(call: GitCall): boolean {
  return call.args[0] === "for-each-ref";
}

export function isJudgmentStart(call: GitCall): boolean {
  return call.args[0] === "cat-file";
}

export interface ReadCounts {
  readonly snapshots: number;
  readonly perNode: number;
  readonly judgments: number;
}

export function countsOf(calls: readonly GitCall[]): ReadCounts {
  const snapshots = calls.filter(isSnapshotRead).length;
  return {
    snapshots,
    perNode: calls.length - snapshots,
    judgments: calls.filter(isJudgmentStart).length,
  };
}

export function judgedHeads(calls: readonly GitCall[]): readonly string[] {
  return calls
    .filter(isJudgmentStart)
    .map((call) => (call.input ?? "").split("^{commit}")[0] ?? "");
}
