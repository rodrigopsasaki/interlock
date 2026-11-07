import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { UNRECORDED_START } from "ledger";
import {
  createHerdrRuntime,
  NO_OBSERVATION_CAPABILITY,
  type Runtime,
  type RuntimeObservation,
} from "runner";
import { buildRegistry, judgeValue } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { type FakeHerdrServer, startFakeHerdrServer } from "../../runner/test/herdr/fakeServer.ts";
import {
  type PositionsV0,
  runInterlockPosition,
  UNRECORDED_IN_V0,
  upcastPositionsV0,
} from "../src/position.ts";
import { git as landedGit, landedRepository, writeLandedJournal } from "./face/landedFixture.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

function stubRuntime(overrides: Partial<Runtime> = {}): Runtime {
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
    ...overrides,
  };
}

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const directories: string[] = [];

let herdr: FakeHerdrServer | undefined;

afterEach(async () => {
  await herdr?.close();
  herdr = undefined;
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

function liveSession(
  graph: string,
  node: string,
  session: string,
  role: string,
  startedAt?: number,
): unknown[] {
  return [
    { interlock: "event@v4", kind: "node-created", node: { graph, id: node } },
    {
      interlock: startedAt === undefined ? "event@v6" : "event@v9",
      ...(startedAt === undefined ? {} : { startedAt }),
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
  expect(outcome, JSON.stringify(outcome)).toEqual({ kind: "valid", tag: "positions@v2" });
  return JSON.parse(result.message);
}

describe("interlock position --json", () => {
  it("reads two repositories in one read, each with its root, origin and every graph", async () => {
    const first = repository({ alpha: graphYaml("alpha", ["a"]), beta: graphYaml("beta", ["b"]) });
    const second = repository({ gamma: graphYaml("gamma", ["c"]) });
    fixtureGit(["remote", "add", "origin", "git@github.com:someone/second.git"], {
      cwd: second,
    });

    const parsed = await positionsJson(["--repo", first, "--repo", second], first);

    expect(parsed.interlock).toBe("positions@v2");
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
      position: { interlock: "position@v3", graph: "alpha" },
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

  it("lists the live attempts across every graph with role, runtime, agent status, pane and start", async () => {
    const cwd = repository({
      alpha: graphYaml("alpha", ["a"]),
      beta: graphYaml("beta", ["b"]),
    });
    writeJournal(cwd, [
      ...liveSession("alpha", "a", "session-a", "implementer", 1_700_000_000_000),
      ...liveSession("beta", "b", "session-b", "worker"),
    ]);
    const observation: RuntimeObservation = {
      attempt: (query) =>
        query.session === "session-a"
          ? {
              agentStatus: "blocked",
              pane: { state: "known", address: "w1:p2" },
              liveWork: () => Promise.resolve({ state: "none" }),
            }
          : {
              agentStatus: "unknown",
              pane: { state: "unknown", because: "the runtime lists no agent for session-b" },
              liveWork: () => Promise.resolve({ state: "unknown", because: "not listed" }),
            },
    };
    const runtime = stubRuntime({ observe: () => Promise.resolve(ok(observation)) });

    const parsed = await positionsJson([], cwd, runtime);
    const [entry] = parsed.repositories;
    expect(entry.live).toEqual([
      {
        graph: "alpha",
        node: "a",
        session: "session-a",
        role: "implementer",
        provider: "unknown",
        chosenBy: { kind: "unrecorded" },
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
        agentStatus: "blocked",
        pane: { state: "known", address: "w1:p2" },
        startedAt: { state: "known", epochMs: 1_700_000_000_000 },
      },
      {
        graph: "beta",
        node: "b",
        session: "session-b",
        provider: "unknown",
        chosenBy: { kind: "unrecorded" },
        runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
        agentStatus: "unknown",
        pane: { state: "unknown", because: "the runtime lists no agent for session-b" },
        startedAt: { state: "unknown", because: UNRECORDED_START },
      },
    ]);
    expect(entry.graphs[0].position.nodes[0].attempts[0].agentStatus).toBe("blocked");
  });

  it("takes one runtime observation, one agent.list, for every graph in two repositories", async () => {
    const first = repository({ alpha: graphYaml("alpha", ["a"]), beta: graphYaml("beta", ["b"]) });
    const second = repository({ gamma: graphYaml("gamma", ["c"]) });
    writeJournal(first, [
      ...liveSession("alpha", "a", "s-a", "implementer", 1_000),
      ...liveSession("beta", "b", "s-b", "tester", 2_000),
    ]);
    writeJournal(second, [
      ...liveSession("gamma", "c", "s-c", "reviewer", 3_000),
      ...liveSession("gamma", "d", "s-d", "reviewer"),
    ]);
    const socketDirectory = mkdtempSync(join(runsRoot, "sock-"));
    directories.push(socketDirectory);
    herdr = await startFakeHerdrServer(
      join(socketDirectory, `${randomUUID().slice(0, 8)}.sock`).replace(`${process.cwd()}/`, ""),
    );
    herdr.panes = [
      {
        pane_id: "p-a",
        agent_status: "working",
        tokens: { graph: "alpha", node: "a", session: "s-a" },
      },
      {
        pane_id: "p-b",
        agent_status: "idle",
        tokens: { graph: "beta", node: "b", session: "s-b" },
      },
      { agent_status: "done", tokens: { graph: "gamma", node: "c", session: "s-c" } },
      {
        pane_id: "p-other",
        agent_status: "idle",
        tokens: { graph: "gamma", node: "d", session: "stale" },
      },
    ];
    const created = await createHerdrRuntime(herdr.socketPath);
    if (isErr(created)) throw new Error("expected the fake herdr runtime");

    const parsed = await positionsJson(["--repo", first, "--repo", second], first, created.value);

    expect(herdr.calls.map((call) => call.method)).toEqual(["agent.list"]);
    const [one, two] = parsed.repositories;
    expect(
      one.live.map((attempt: Record<string, unknown>) => [attempt["agentStatus"], attempt["pane"]]),
    ).toEqual([
      ["working", { state: "known", address: "p-a" }],
      ["idle", { state: "known", address: "p-b" }],
    ]);
    expect(two.live).toMatchObject([
      {
        session: "s-c",
        agentStatus: "done",
        pane: { state: "unknown", because: "the runtime lists the agent without a pane" },
        startedAt: { state: "known", epochMs: 3_000 },
      },
      {
        session: "s-d",
        agentStatus: "unknown",
        pane: { state: "unknown", because: "the runtime lists no agent for session s-d" },
        startedAt: { state: "unknown", because: UNRECORDED_START },
      },
    ]);
  });

  it("reads every pane unknown with a reason, and keeps each recorded start, when the runtime cannot observe", async () => {
    const cwd = repository({ alpha: graphYaml("alpha", ["a"]) });
    writeJournal(cwd, liveSession("alpha", "a", "s-a", "implementer", 5_000));

    const incapable = await positionsJson([], cwd, stubRuntime());
    expect(incapable.repositories[0].live[0]).toMatchObject({
      agentStatus: "unknown",
      pane: { state: "unknown", because: NO_OBSERVATION_CAPABILITY },
      startedAt: { state: "known", epochMs: 5_000 },
    });

    const failing = stubRuntime({
      observe: () => Promise.resolve(err({ kind: "transport", because: "the socket closed" })),
    });
    const failed = await positionsJson([], cwd, failing);
    expect(failed.repositories[0].live[0]).toMatchObject({
      pane: {
        state: "unknown",
        because: "the runtime's observation failed: the socket closed",
      },
      startedAt: { state: "known", epochMs: 5_000 },
    });
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
      interlock: "position@v3",
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

describe("positions@v0 reads", () => {
  it("validates unchanged and reads its live attempts' pane and start as unknown, without rewriting it", () => {
    const v0: PositionsV0 = {
      interlock: "positions@v0",
      repositories: [
        {
          asked: "/repo",
          state: "found",
          root: "/repo",
          journal: { state: "read" },
          graphs: [],
          live: [
            {
              graph: "g",
              node: "a",
              session: "s",
              runtime: { name: "r", kind: "k", model: "m" },
              agentStatus: "idle",
            },
          ],
        },
        { asked: "/nowhere", state: "not-found", because: "no .interlock directory" },
      ],
    };
    const before = JSON.stringify(v0);
    const registry = buildRegistry();
    expect(judgeValue(registry, v0)).toEqual({ kind: "valid", tag: "positions@v0" });

    const read = upcastPositionsV0(v0);

    expect(JSON.stringify(v0)).toBe(before);
    expect(judgeValue(registry, JSON.parse(JSON.stringify(read)))).toEqual({
      kind: "valid",
      tag: "positions@v2",
    });
    const [found] = read.repositories;
    expect(found !== undefined && "live" in found ? found.live : []).toEqual([
      {
        graph: "g",
        node: "a",
        session: "s",
        runtime: { name: "r", kind: "k", model: "m" },
        agentStatus: "idle",
        provider: "unknown",
        chosenBy: { kind: "unrecorded" },
        pane: { state: "unknown", because: UNRECORDED_IN_V0 },
        startedAt: { state: "unknown", because: UNRECORDED_IN_V0 },
      },
    ]);
  });
});

describe("attempt provider attribution", () => {
  it("carries account, profile, model and selection evidence on live and node attempts in JSON and text", async () => {
    const root = repository({ routed: graphYaml("routed", ["n"]) });
    const chosenBy = {
      kind: "routed",
      because: "highest allowance fraction",
      candidates: [
        {
          provider: "account",
          headroom: {
            state: "known",
            fraction: 0.75,
            raw: 25,
            unit: "percent used",
            source: "fixture",
          },
        },
      ],
    };
    writeJournal(root, [
      {
        interlock: "event@v10",
        kind: "session-started",
        session: {
          id: "routed-session",
          node: { graph: "routed", id: "n" },
          runtime: { name: "profile", kind: "fake", model: "m", provider: "account", chosenBy },
        },
        brief: {
          graph: "routed",
          node: "n",
          role: "implementer",
          acceptance: "x",
          gates: [],
          scope: [],
        },
      },
      {
        interlock: "event@v10",
        kind: "lease-taken",
        node: { graph: "routed", id: "n" },
        session: "routed-session",
        expiry: 9_999_999_999_999,
      },
    ]);
    const parsed = await positionsJson(["--repo", root], root, stubRuntime());
    const [read] = parsed.repositories;
    expect(read.live[0]).toMatchObject({
      provider: "account",
      chosenBy,
      runtime: { name: "profile", model: "m" },
    });
    expect(read.graphs[0].position.nodes[0].attempts[0]).toMatchObject({
      provider: "account",
      chosenBy,
      runtime: { name: "profile", model: "m" },
    });
    const text = await runInterlockPosition(["--repo", root], {
      cwd: root,
      runtime: stubRuntime(),
    });
    expect(text.message).toContain(
      "profile (fake, m), provider account, chosen-by routed (highest allowance fraction)",
    );
  });

  it("projects historical attempts as provider unknown and chosen-by unrecorded", async () => {
    const root = repository({ old: graphYaml("old", ["n"]) });
    writeJournal(root, liveSession("old", "n", "old-session", "implementer"));
    const parsed = await positionsJson(["--repo", root], root, stubRuntime());
    const [read] = parsed.repositories;
    expect(read.live[0]).toMatchObject({ provider: "unknown", chosenBy: { kind: "unrecorded" } });
    expect(read.graphs[0].position.nodes[0].attempts[0]).toMatchObject({
      provider: "unknown",
      chosenBy: { kind: "unrecorded" },
    });
  });
});
