import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { createLedger, type LedgerEvent, type Outcome } from "ledger";
import type { Runtime } from "runner";
import { buildRegistry, judgeValue } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockPosition } from "../src/position.ts";
import { runSchemaValidate } from "../src/schema/validate.ts";
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

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

interface FixtureNode {
  readonly id: string;
  readonly dependsOn?: readonly string[];
}

function graphYaml(id: string, nodes: readonly FixtureNode[]): string {
  return [
    "interlock: graph@v0",
    `id: ${id}`,
    "gates:",
    "  - id: approved",
    "    kind: human",
    "nodes:",
    ...nodes.flatMap((node) => [
      `  - id: ${node.id}`,
      `    depends_on: [${(node.dependsOn ?? []).join(", ")}]`,
    ]),
    "",
  ].join("\n");
}

function repository(graphs: Readonly<Record<string, string>>): string {
  const directory = mkdtempSync(join(runsRoot, "position-ready-"));
  directories.push(directory);
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  for (const [id, content] of Object.entries(graphs)) {
    writeFileSync(join(directory, ".interlock", "graphs", `${id}.yaml`), content);
  }
  return directory;
}

async function appendEvents(directory: string, events: readonly LedgerEvent[]): Promise<void> {
  const journal = join(directory, ".interlock", "ledger");
  mkdirSync(journal, { recursive: true });
  const opened = await createLedger({ clock: createSystemClock(), directory: journal });
  if (isErr(opened)) throw new Error("expected the fixture journal to open");
  const ledger = opened.value;
  for (const event of events) ledger.append(event);
  await ledger.close();
}

async function approve(directory: string, graph: string): Promise<void> {
  const result = await runGraphApprove(
    [graph, "--by", "Rodrigo Sasaki", "--because", "fixture approval"],
    { cwd: directory },
  );
  expect(result.exitCode, result.message).toBe(0);
}

function sessionStarted(graph: string, node: string, session: string): LedgerEvent {
  return {
    kind: "session-started",
    session: {
      id: session,
      node: { graph, id: node },
      runtime: { name: "test-runtime", kind: "test-kind", model: "test-model" },
    },
    brief: { graph, node, role: "implementer", acceptance: "x", gates: [], scope: [] },
  };
}

function leaseTaken(graph: string, node: string, session: string): LedgerEvent {
  return {
    kind: "lease-taken",
    node: { graph, id: node },
    session,
    expiry: 9_999_999_999_999,
  };
}

function outcomeSet(graph: string, node: string, outcome: Outcome): LedgerEvent {
  return { kind: "outcome-set", node: { graph, id: node }, outcome };
}

async function readyJson(args: readonly string[], cwd: string) {
  const result = await runInterlockPosition(["--ready", "--json", ...args], {
    cwd,
    runtime: stubRuntime(),
  });
  expect(result.exitCode).toBe(0);
  expect(result.message).not.toContain("\n");
  const parsed: unknown = JSON.parse(result.message);
  const outcome = judgeValue(buildRegistry(), parsed);
  expect(outcome, JSON.stringify(outcome)).toEqual({ kind: "valid", tag: "ready@v0" });
  return JSON.parse(result.message);
}

describe("interlock position --ready", () => {
  it("a ready node in a fixture graph is listed with its graph and node", async () => {
    const cwd = repository({ demo: graphYaml("demo", [{ id: "a" }]) });
    await approve(cwd, "demo");

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry).toMatchObject({ state: "read", root: cwd });
    expect(entry.ready).toEqual([{ graph: "demo", node: "a", criticalPathIndex: 0, nodeIndex: 0 }]);
    expect(entry.unreadable).toEqual([]);
  });

  it("a node that is running, held, cleared or blocked is not listed", async () => {
    const cwd = repository({
      demo: graphYaml("demo", [
        { id: "running" },
        { id: "held" },
        { id: "cleared" },
        { id: "blocked", dependsOn: ["held"] },
        { id: "free" },
      ]),
    });
    await appendEvents(cwd, [
      sessionStarted("demo", "running", "session-running"),
      leaseTaken("demo", "running", "session-running"),
      outcomeSet("demo", "held", {
        kind: "held",
        receipts: [],
        on: { kind: "decision", authority: "Rodrigo Sasaki" },
        because: "waiting on a person",
        expiry: 9_999_999_999_999,
      }),
      outcomeSet("demo", "cleared", { kind: "cleared", receipts: [] }),
    ]);
    await approve(cwd, "demo");

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.state).toBe("read");
    expect(entry.ready).toEqual([
      { graph: "demo", node: "free", criticalPathIndex: -1, nodeIndex: 3 },
    ]);
  });

  it("a ready node of an unapproved graph is not listed", async () => {
    const cwd = repository({ draft: graphYaml("draft", [{ id: "a" }]) });

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.state).toBe("read");
    expect(entry.ready).toEqual([]);
    expect(entry.unreadable).toEqual([]);
  });

  it("the repository's origin owner and name are carried when identified", async () => {
    const cwd = repository({ demo: graphYaml("demo", [{ id: "a" }]) });
    fixtureGit(["remote", "add", "origin", "git@github.com:someone/fixture.git"], { cwd });
    await approve(cwd, "demo");

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.origin).toEqual({ owner: "someone", name: "fixture" });
  });

  it("launch order is graph order, then critical path, then node index", async () => {
    const cwd = repository({
      alpha: graphYaml("alpha", [{ id: "d1" }, { id: "d2" }, { id: "d3" }]),
      beta: graphYaml("beta", [{ id: "g" }, { id: "e" }, { id: "f", dependsOn: ["e"] }]),
    });
    await appendEvents(cwd, [outcomeSet("beta", "e", { kind: "cleared", receipts: [] })]);
    await approve(cwd, "alpha");
    await approve(cwd, "beta");

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.ready).toEqual([
      { graph: "alpha", node: "d1", criticalPathIndex: 0, nodeIndex: 0 },
      { graph: "alpha", node: "d2", criticalPathIndex: -1, nodeIndex: 1 },
      { graph: "alpha", node: "d3", criticalPathIndex: -1, nodeIndex: 2 },
      { graph: "beta", node: "f", criticalPathIndex: 1, nodeIndex: 2 },
      { graph: "beta", node: "g", criticalPathIndex: -1, nodeIndex: 0 },
    ]);
  });

  it("an unreadable graph is named, never listed as ready", async () => {
    const cwd = repository({
      broken: "interlock: graph@v0\nid: broken\nnodes: [\n",
      good: graphYaml("good", [{ id: "a" }]),
    });
    await approve(cwd, "good");

    const parsed = await readyJson([], cwd);
    const [entry] = parsed.repositories;
    expect(entry.state).toBe("read");
    expect(entry.ready).toEqual([{ graph: "good", node: "a", criticalPathIndex: 0, nodeIndex: 0 }]);
    expect(entry.unreadable).toHaveLength(1);
    expect(entry.unreadable[0].graph).toBe("broken");
    expect(entry.unreadable[0].because).toContain("broken.yaml");
  });

  it("two repositories are answered in the order asked", async () => {
    const first = repository({ alpha: graphYaml("alpha", [{ id: "a" }]) });
    const second = repository({ beta: graphYaml("beta", [{ id: "b" }]) });
    await approve(first, "alpha");
    await approve(second, "beta");

    const parsed = await readyJson(["--repo", second, "--repo", first], first);
    expect(parsed.repositories.map((entry: { root: string }) => entry.root)).toEqual([
      second,
      first,
    ]);
    expect(parsed.repositories[0].ready).toEqual([
      { graph: "beta", node: "b", criticalPathIndex: 0, nodeIndex: 0 },
    ]);
    expect(parsed.repositories[1].ready).toEqual([
      { graph: "alpha", node: "a", criticalPathIndex: 0, nodeIndex: 0 },
    ]);
  });

  it("the read does not grow with attempts: a node with 200 recorded attempts adds nothing to the output beyond its one ready entry", async () => {
    const cwd = repository({ demo: graphYaml("demo", [{ id: "a" }]) });
    await appendEvents(
      cwd,
      Array.from({ length: 200 }, (_, index) => sessionStarted("demo", "a", `session-${index}`)),
    );
    await approve(cwd, "demo");

    const result = await runInterlockPosition(["--ready", "--json"], {
      cwd,
      runtime: stubRuntime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).not.toContain("session-");
    const parsed = JSON.parse(result.message);
    expect(parsed.repositories[0].ready).toEqual([
      { graph: "demo", node: "a", criticalPathIndex: 0, nodeIndex: 0 },
    ]);
  });

  it("the output validates as ready@v0", async () => {
    const cwd = repository({ demo: graphYaml("demo", [{ id: "a" }]) });
    await approve(cwd, "demo");

    const result = await runInterlockPosition(["--ready", "--json"], {
      cwd,
      runtime: stubRuntime(),
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).not.toContain("\n");
    const parsed: unknown = JSON.parse(result.message);
    expect(judgeValue(buildRegistry(), parsed)).toEqual({ kind: "valid", tag: "ready@v0" });

    const file = join(cwd, "ready.json");
    writeFileSync(file, result.message);
    const validated = await runSchemaValidate([file]);
    expect(validated.exitCode).toBe(0);
    expect(validated.message).toContain("valid as ready@v0");
  });

  it("without --ready the output is byte-identical to today's full read on the same fixture", async () => {
    const cwd = repository({ demo: graphYaml("demo", [{ id: "a" }]) });
    await appendEvents(
      cwd,
      Array.from({ length: 3 }, (_, index) => sessionStarted("demo", "a", `session-${index}`)),
    );
    await approve(cwd, "demo");

    const json = await runInterlockPosition(["--json"], { cwd, runtime: stubRuntime() });
    expect(json.exitCode).toBe(0);
    const parsed: unknown = JSON.parse(json.message);
    expect(json.message).toBe(JSON.stringify(JSON.parse(json.message), null, 2));
    expect(judgeValue(buildRegistry(), parsed)).toEqual({ kind: "valid", tag: "positions@v2" });
    const full = JSON.parse(json.message);
    expect(full.repositories[0].graphs[0].position.nodes[0].attempts).toHaveLength(3);

    const text = await runInterlockPosition([], { cwd, runtime: stubRuntime() });
    expect(text.exitCode).toBe(0);
    expect(text.message).toContain("demo");
    expect(text.message).toContain("a — ready");
  });
});
