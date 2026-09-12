import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ok } from "@phyxiusjs/fp";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { gitInitFixture } from "./gitFixture.ts";

function stubRuntime(reportedAgentStatus: NonNullable<Runtime["reportedAgentStatus"]>): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
    reportedAgentStatus,
  };
}

vi.mock("ledger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ledger")>();
  return {
    ...actual,
    createLedger: vi.fn(actual.createLedger),
    attachLedgerSink: vi.fn(actual.attachLedgerSink),
  };
});

const { createLedger, attachLedgerSink } = await import("ledger");
const { runGraphShow } = await import("../../src/graph/show.ts");

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.clearAllMocks();
});

const validGraph = [
  "interlock: graph@v0",
  "id: demo",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "",
].join("\n");

function fixture(graphYaml: string): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  return directory;
}

describe("graph show", () => {
  it("renders a position for a valid graph over an empty journal", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("not approved");
    expect(result.message).toContain("a — ready");
  });

  it("refuses a malformed graph with a sentence naming the file", async () => {
    const cwd = fixture(["interlock: graph@v1", "id: demo", "nodes: []", ""].join("\n"));
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("demo.yaml");
    expect(result.message).toContain("graph@v0");
  });

  it("refuses with a sentence when no graph id is given", async () => {
    const result = await runGraphShow([]);
    expect(result.exitCode).not.toBe(0);
  });

  it("refuses with a sentence naming the line when the journal carries a ReplayRefusal", async () => {
    const cwd = fixture(validGraph);
    mkdirSync(join(cwd, ".interlock", "ledger"), { recursive: true });
    writeFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      `${JSON.stringify({ interlock: "event@v99", kind: "node-created" })}\n`,
    );
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("line 1");
    expect(result.message).toContain("event@v99");
  });
});

describe("graph show --json", () => {
  it("prints position@v1 with stable keys, verbatim data underneath", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphShow(["demo", "--json"], { cwd });
    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.message);
    expect(parsed.interlock).toBe("position@v1");
    expect(parsed.graph).toBe("demo");
    expect(parsed.approval).toBe("not-approved");
    expect(parsed.nodes[0]).toMatchObject({
      id: "a",
      dependsOn: [],
      state: { kind: "ready" },
      float: { kind: "unknown" },
    });
    expect(Object.keys(parsed)).toEqual([
      "interlock",
      "graph",
      "approval",
      "nodes",
      "criticalPath",
    ]);
  });
});

describe("graph show live agent status", () => {
  it("joins a live session's agent status through an injected runtime, never touching a real herdr socket", async () => {
    const graphWithASession = [
      "interlock: graph@v0",
      "id: demo",
      "nodes:",
      "  - id: a",
      "    depends_on: []",
      "",
    ].join("\n");
    const cwd = fixture(graphWithASession);
    mkdirSync(join(cwd, ".interlock", "ledger"), { recursive: true });
    const events = [
      {
        interlock: "event@v4",
        kind: "node-created",
        node: { graph: "demo", id: "a" },
      },
      {
        interlock: "event@v4",
        kind: "session-started",
        session: { id: "session-1", node: { graph: "demo", id: "a" } },
        brief: {
          graph: "demo",
          node: "a",
          role: "worker",
          acceptance: "x",
          gates: [],
          scope: [],
        },
        graphBaseSha: "deadbeef",
      },
      {
        interlock: "event@v4",
        kind: "lease-taken",
        node: { graph: "demo", id: "a" },
        session: "session-1",
        expiry: 9_999_999_999_999,
      },
    ];
    writeFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    );

    const calls: { graph: string; node: string; session: string }[] = [];
    const runtime = stubRuntime((query) => {
      calls.push(query);
      return Promise.resolve(ok("working"));
    });

    const result = await runGraphShow(["demo", "--json"], { cwd, runtime });
    expect(result.exitCode).toBe(0);
    expect(calls).toEqual([{ graph: "demo", node: "a", session: "session-1" }]);
    const parsed = JSON.parse(result.message);
    expect(parsed.nodes[0].attempts[0]).toMatchObject({
      session: "session-1",
      agentStatus: "working",
    });
  });
});

describe("show-never-writes", () => {
  it("never creates a journal directory on disk", async () => {
    const cwd = fixture(validGraph);
    const result = await runGraphShow(["demo"], { cwd });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(cwd, ".interlock", "ledger"))).toBe(false);
  });

  it("never opens a ledger for writing: createLedger and attachLedgerSink are never called", async () => {
    const cwd = fixture(validGraph);
    await runGraphShow(["demo"], { cwd });
    expect(createLedger).not.toHaveBeenCalled();
    expect(attachLedgerSink).not.toHaveBeenCalled();
  });
});
