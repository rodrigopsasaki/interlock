import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@phyxiusjs/fp";
import type { Runtime } from "runner";
import { buildRegistry, judgeValue } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { runInterlockPosition } from "../src/position.ts";
import { git as landedGit, landedRepository, writeLandedJournal } from "./face/landedFixture.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

function stubRuntime(reportedAgentStatus: NonNullable<Runtime["reportedAgentStatus"]>): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    reportedAgentStatus,
  };
}

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function graphYaml(id: string, nodes: readonly string[]): string {
  return [
    "interlock: graph@v0",
    `id: ${id}`,
    "nodes:",
    ...nodes.flatMap((node) => [`  - id: ${node}`, "    depends_on: []"]),
    "",
  ].join("\n");
}

function repository(graphs: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(runsRoot, "position-"));
  directories.push(directory);
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  for (const [id, content] of Object.entries(graphs)) {
    writeFileSync(join(directory, ".interlock", "graphs", `${id}.yaml`), content);
  }
  return directory;
}

function writeJournal(directory: string, events: readonly unknown[]): void {
  mkdirSync(join(directory, ".interlock", "ledger"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "ledger", "journal.jsonl"),
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
}

function liveSession(graph: string, node: string, session: string, role: string): unknown[] {
  return [
    { interlock: "event@v4", kind: "node-created", node: { graph, id: node } },
    {
      interlock: "event@v6",
      kind: "session-started",
      session: {
        id: session,
        node: { graph, id: node },
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
      },
      brief: { graph, node, role, acceptance: "x", gates: [], scope: [] },
      graphBaseSha: "deadbeef",
    },
    {
      interlock: "event@v4",
      kind: "lease-taken",
      node: { graph, id: node },
      session,
      expiry: 9_999_999_999_999,
    },
  ];
}

async function positionsJson(args: readonly string[], cwd: string, runtime?: Runtime) {
  const result = await runInterlockPosition(["--json", ...args], {
    cwd,
    ...(runtime === undefined ? {} : { runtime }),
  });
  expect(result.exitCode).toBe(0);
  const parsed: unknown = JSON.parse(result.message);
  const outcome = judgeValue(buildRegistry(), parsed);
  expect(outcome, JSON.stringify(outcome)).toEqual({ kind: "valid", tag: "positions@v0" });
  return JSON.parse(result.message);
}

describe("interlock position --json", () => {
  it("reads two repositories in one read, each with its root, origin and every graph", async () => {
    const first = repository({ alpha: graphYaml("alpha", ["a"]), beta: graphYaml("beta", ["b"]) });
    const second = repository({ gamma: graphYaml("gamma", ["c"]) });
    execFileSync("git", ["remote", "add", "origin", "git@github.com:someone/second.git"], {
      cwd: second,
    });

    const parsed = await positionsJson(["--repo", first, "--repo", second], first);

    expect(parsed.interlock).toBe("positions@v0");
    expect(parsed.repositories).toHaveLength(2);
    const [one, two] = parsed.repositories;
    expect(one).toMatchObject({
      state: "found",
      root: first,
      journal: { state: "read" },
      live: [],
    });
    expect(one.origin).toBeUndefined();
    expect(one.graphs.map((graph: { graph: string }) => graph.graph)).toEqual(["alpha", "beta"]);
    expect(one.graphs[0]).toMatchObject({
      state: "read",
      position: { interlock: "position@v2", graph: "alpha" },
    });
    expect(two).toMatchObject({
      root: second,
      origin: {
        state: "identified",
        url: "ssh://github.com/someone/second.git",
        owner: "someone",
        name: "second",
      },
    });
    expect(two.graphs[0].position.graph).toBe("gamma");
  });

  it("defaults to the current repository", async () => {
    const only = repository({ alpha: graphYaml("alpha", ["a"]) });
    const parsed = await positionsJson([], only);
    expect(parsed.repositories.map((entry: { root: string }) => entry.root)).toEqual([only]);
  });

  it("says unreadable with the failing line for a journal that cannot be read, never an empty one", async () => {
    const cwd = repository({ alpha: graphYaml("alpha", ["a"]) });
    writeJournal(cwd, [
      { interlock: "event@v4", kind: "node-created", node: { graph: "alpha", id: "a" } },
      { interlock: "event@v99", kind: "node-created" },
    ]);

    const parsed = await positionsJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.journal).toMatchObject({ state: "unreadable", line: 2 });
    expect(entry.journal.because).toContain("event@v99");
    expect(entry.live).toBeUndefined();
    expect(entry.graphs).toEqual([
      { graph: "alpha", state: "unreadable", because: entry.journal.because },
    ]);
  });

  it("keeps an unparseable graph file as unreadable with the loader's refusal, beside graphs that load", async () => {
    const cwd = repository({
      alpha: graphYaml("alpha", ["a"]),
      broken: "interlock: graph@v0\nid: broken\nnodes: [\n",
    });

    const parsed = await positionsJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.graphs).toHaveLength(2);
    expect(entry.graphs[0].state).toBe("read");
    expect(entry.graphs[1]).toMatchObject({ graph: "broken", state: "unreadable" });
    expect(entry.graphs[1].because).toContain("broken.yaml");
  });

  it("lists the live attempts across every graph with role, runtime and agent status", async () => {
    const cwd = repository({
      alpha: graphYaml("alpha", ["a"]),
      beta: graphYaml("beta", ["b"]),
    });
    writeJournal(cwd, [
      ...liveSession("alpha", "a", "session-a", "implementer"),
      ...liveSession("beta", "b", "session-b", "worker"),
    ]);
    const calls: string[] = [];
    const runtime = stubRuntime((query) => {
      calls.push(query.session);
      return Promise.resolve(ok(query.session === "session-a" ? "blocked" : undefined));
    });

    const parsed = await positionsJson([], cwd, runtime);
    const [entry] = parsed.repositories;
    expect(entry.live).toEqual([
      {
        graph: "alpha",
        node: "a",
        session: "session-a",
        role: "implementer",
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
        agentStatus: "blocked",
      },
      {
        graph: "beta",
        node: "b",
        session: "session-b",
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
        agentStatus: "unknown",
      },
    ]);
    expect(calls).toEqual(["session-a", "session-b"]);
    expect(entry.graphs[0].position.nodes[0].attempts[0].agentStatus).toBe("blocked");
  });

  it("says not-found for an asked path with no interlock repository, and still reads the rest", async () => {
    const cwd = repository({ alpha: graphYaml("alpha", ["a"]) });
    const bare = "/";
    const parsed = await positionsJson(["--repo", bare, "--repo", cwd], cwd);
    expect(parsed.repositories[0]).toMatchObject({ asked: bare, state: "not-found" });
    expect(parsed.repositories[1]).toMatchObject({ state: "found", root: cwd });
  });

  it("caches nothing between calls", async () => {
    const cwd = repository({ alpha: graphYaml("alpha", ["a"]) });
    const before = await positionsJson([], cwd);
    expect(before.repositories[0].graphs).toHaveLength(1);
    writeFileSync(join(cwd, ".interlock", "graphs", "beta.yaml"), graphYaml("beta", ["b"]));
    const after = await positionsJson([], cwd);
    expect(after.repositories[0].graphs).toHaveLength(2);
  });
});

describe("interlock position --json: a partly reverted node", () => {
  it("prints partly-reverted-on-main with each undone commit's undoer, and keeps the graph not done", async () => {
    const { root } = landedRepository(runsRoot, { solo: [] });
    directories.push(root);
    const base = landedGit(root, "rev-parse", "HEAD");
    const commits = ["one", "two", "three"].map((name) => {
      mkdirSync(join(root, "src"), { recursive: true });
      writeFileSync(join(root, "src", `${name}.ts`), `export const ${name} = true;\n`);
      landedGit(root, "add", "src");
      landedGit(root, "commit", "--quiet", "-m", `feat: ${name}`);
      return landedGit(root, "rev-parse", "HEAD");
    });
    const [, second, head] = commits;
    if (second === undefined || head === undefined) throw new Error("expected three commits");
    landedGit(root, "rm", "--quiet", "src/two.ts");
    landedGit(root, "commit", "--quiet", "-m", "chore: take two back out");
    const undo = landedGit(root, "rev-parse", "HEAD");
    writeFileSync(
      join(root, ".interlock", "graphs", "solo.yaml"),
      ["interlock: graph@v0", "id: solo", "nodes:", "  - id: n", "    depends_on: []", ""].join(
        "\n",
      ),
    );
    writeLandedJournal(root, [{ graph: "solo", node: "n", session: "s-n", base, head }]);

    const parsed = await positionsJson(["--repo", root], root);
    const [repository] = parsed.repositories;
    expect(repository.graphs[0].position).toMatchObject({
      interlock: "position@v2",
      done: false,
      nodes: [
        {
          id: "n",
          landed: {
            kind: "partly-reverted-on-main",
            main: "main",
            head,
            reverted: [second],
            revertedBy: { [second]: undo },
          },
        },
      ],
    });
  });
});
