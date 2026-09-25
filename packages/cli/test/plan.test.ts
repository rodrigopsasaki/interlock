import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, isErr, ok } from "@phyxiusjs/fp";
import { readBriefFile } from "debrief";
import { loadGraphDocument } from "face";
import { isLedgerEvent, type Outcome } from "ledger";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import {
  type FakeSubstrateServer,
  startFakeSubstrateServer,
} from "../../substrate/test/support/fakeSubstrateServer.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockPlan } from "../src/plan.ts";
import { commitAll, commitPath, gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let server: FakeSubstrateServer | undefined;
const savedRuntimesEnv = process.env["INTERLOCK_RUNTIMES"];

afterEach(async () => {
  if (server !== undefined) await server.close();
  server = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  if (savedRuntimesEnv === undefined) delete process.env["INTERLOCK_RUNTIMES"];
  else process.env["INTERLOCK_RUNTIMES"] = savedRuntimesEnv;
});

const configYaml = [
  "interlock: config@v0",
  "standing_gates:",
  "  - id: standing",
  "    kind: command",
  '    run: "true"',
  "",
].join("\n");

const localYaml = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "worktree_root: .worktrees",
  "lease_ms: 60000",
  "run_timeout_ms: 5000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

function fixture(local = localYaml): string {
  directory = mkdtempSync(join(runsRoot, "plan-"));
  process.env["INTERLOCK_RUNTIMES"] = join(directory, "does-not-exist.yaml");
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  writeFileSync(join(directory, ".interlock", "local.yaml"), local);
  gitInitFixture(directory);
  execFileSync("git", ["config", "commit.gpgsign", "false"], {
    cwd: directory,
  });
  commitAll(directory, "fixture content");
  return directory;
}

function localYamlFor(address: string): string {
  return localYaml.replace("  address: none", `  address: ${address}\n  send_repository: true`);
}

function fixtureWithOrigin(local: string): string {
  const cwd = fixture(local);
  execFileSync("git", ["remote", "add", "origin", "git@forge.example:owner/name.git"], { cwd });
  return cwd;
}

function stubRuntime(): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: (_agent, until, timeoutMs) =>
      until.length === 1 && until[0] === "working"
        ? Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "idle" }))
        : Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

function graphYaml(id: string): string {
  return [
    "interlock: graph@v0",
    `id: ${id}`,
    "gates:",
    "  - id: approved",
    "    kind: human",
    "nodes:",
    "  - id: only-node",
    "    acceptance: a trivial node",
    "    depends_on: []",
    "",
  ].join("\n");
}

function writeSessionOutput(
  worktreePath: string,
  graph: string,
  node: string,
  graphContent: string,
): void {
  const graphPath = join(worktreePath, ".interlock", "graphs", `${graph}.yaml`);
  if (!existsSync(graphPath)) {
    mkdirSync(join(worktreePath, ".interlock", "graphs"), { recursive: true });
    writeFileSync(graphPath, graphContent);
    commitPath(worktreePath, join(".interlock", "graphs", `${graph}.yaml`), "chore: fixture graph");
  }

  const debriefDir = join(worktreePath, ".interlock", "sessions", graph, node);
  const debriefPath = join(debriefDir, "debrief.yaml");
  if (!existsSync(debriefPath)) {
    mkdirSync(debriefDir, { recursive: true });
    writeFileSync(debriefPath, "interlock: debrief@v2\n");
    commitPath(
      worktreePath,
      join(".interlock", "sessions", graph, node, "debrief.yaml"),
      "chore: fixture debrief",
    );
  }
}

function finishedWaitUntil(
  worktreePath: string,
  graph: string,
  node: string,
  graphContent: string,
): Runtime["waitUntil"] {
  return (agent, until, timeoutMs) => {
    writeSessionOutput(worktreePath, graph, node, graphContent);
    return stubRuntime().waitUntil(agent, until, timeoutMs);
  };
}

function latestOutcomeFor(cwd: string, graph: string, id: string): Outcome | undefined {
  const journal = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
  const outcomes = journal
    .trim()
    .split("\n")
    .map((line): unknown => JSON.parse(line))
    .filter(isLedgerEvent)
    .filter(
      (event): event is Extract<typeof event, { kind: "outcome-set" }> =>
        event.kind === "outcome-set" && event.node.graph === graph && event.node.id === id,
    );
  return outcomes.at(-1)?.outcome;
}

describe("interlock plan", () => {
  it("binds an enabled origin through plan's actual context client", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const cwd = fixtureWithOrigin(localYamlFor(server.url));
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    await runInterlockPlan(["demo", "--ask", "add context"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });

    expect(server.calls[0]?.body).toMatchObject({
      repository: {
        owner: "owner",
        name: "name",
        origin_url: "ssh://forge.example/owner/name.git",
      },
    });
  });

  it("uses an explicit context selector without narrowing the committed planning authority", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const cwd = fixtureWithOrigin(localYamlFor(server.url));
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const selected = [".interlock/config.yaml"];
    const authoritativeScope = execFileSync("git", ["ls-files"], {
      cwd,
      encoding: "utf-8",
    })
      .split("\n")
      .filter((path) => path.length > 0);

    const result = await runInterlockPlan(
      ["demo", "--ask", "add context", "--context-scope", JSON.stringify(selected)],
      {
        cwd,
        clock: createControlledClock(),
        runtime: {
          ...stubRuntime(),
          waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const request = server.calls.find((call) => call.verb === "context");
    expect(request?.body).toMatchObject({ scope: selected });
    const brief = await readBriefFile(
      join(worktreePath, ".interlock", "sessions", "demo", "plan", "demo", "brief.md"),
    );
    if (isErr(brief) || brief.value.kind !== "v1") throw new Error("expected a planning brief");
    expect(brief.value.frontMatter.contextScope).toEqual(selected);
    expect(brief.value.frontMatter.scope).toEqual(authoritativeScope);
  }, 30_000);

  it("uses an empty context selector as an explicit repository-level query", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const cwd = fixtureWithOrigin(localYamlFor(server.url));
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    const result = await runInterlockPlan(
      ["demo", "--ask", "add context", "--context-scope", "[]"],
      {
        cwd,
        clock: createControlledClock(),
        runtime: {
          ...stubRuntime(),
          waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
        },
      },
    );

    expect(result.exitCode).toBe(0);
    const request = server.calls.find((call) => call.verb === "context");
    expect(request?.body).toMatchObject({ scope: [] });
    const brief = await readBriefFile(
      join(worktreePath, ".interlock", "sessions", "demo", "plan", "demo", "brief.md"),
    );
    if (isErr(brief) || brief.value.kind !== "v1") throw new Error("expected a planning brief");
    expect(brief.value.frontMatter.contextScope).toEqual([]);
  }, 30_000);

  it("keeps the full tracked context query when the selector is omitted", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const cwd = fixtureWithOrigin(localYamlFor(server.url));
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const authoritativeScope = execFileSync("git", ["ls-files"], {
      cwd,
      encoding: "utf-8",
    })
      .split("\n")
      .filter((path) => path.length > 0);

    const result = await runInterlockPlan(["demo", "--ask", "add context"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });

    expect(result.exitCode).toBe(0);
    const request = server.calls.find((call) => call.verb === "context");
    expect(request?.body).toMatchObject({ scope: authoritativeScope });
    const brief = await readBriefFile(
      join(worktreePath, ".interlock", "sessions", "demo", "plan", "demo", "brief.md"),
    );
    if (isErr(brief) || brief.value.kind !== "v1") throw new Error("expected a planning brief");
    expect(brief.value.frontMatter.contextScope).toBeUndefined();
    expect(brief.value.frontMatter.scope).toEqual(authoritativeScope);
  }, 30_000);

  it("refuses without a graph id", async () => {
    const result = await runInterlockPlan([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock plan");
  });

  it("refuses without --ask", async () => {
    const cwd = fixture();
    const result = await runInterlockPlan(["demo"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("--ask");
  });

  it("lands a valid graph as not approved, never leasing a node of it", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("landed not approved");

    const producedPath = join(worktreePath, ".interlock", "graphs", "demo.yaml");
    expect(existsSync(producedPath)).toBe(true);

    const loaded = await loadGraphDocument(producedPath);
    if (isErr(loaded)) {
      throw new Error("expected the fixture graph to load as a valid graph@v0 document");
    }
    expect(loaded.value.id).toBe("demo");
  }, 30_000);

  it("the planning node never appears in the graph it wrote", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });

    expect(result.exitCode).toBe(0);
    const producedPath = join(worktreePath, ".interlock", "graphs", "demo.yaml");
    const loaded = await loadGraphDocument(producedPath);
    if (isErr(loaded)) {
      throw new Error("expected the fixture graph to load");
    }
    const ids = loaded.value.nodes.map((entry) => entry.id);
    expect(ids).not.toContain("plan/demo");
    expect(ids).toEqual(["only-node"]);

    const journal = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
    const started = journal
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line))
      .filter(isLedgerEvent)
      .find((event) => event.kind === "session-started");
    if (started === undefined || started.kind !== "session-started") {
      throw new Error("expected a session-started event");
    }
    expect(started.session.node).toEqual({ graph: "demo", id: "plan/demo" });
  }, 30_000);

  it("refuses an invalid graph with a sentence, never narrating it as not approved", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const lines: string[] = [];

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", "not: a-graph\n"),
      },
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("shape tag is missing");
    expect(lines.some((line) => line.includes("landed not approved"))).toBe(false);

    const recorded = latestOutcomeFor(cwd, "demo", "plan/demo");
    expect(recorded?.kind).toBe("held");
  }, 30_000);

  it("refuses a produced graph whose id does not match the graph it was planned for, recording held", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(
          worktreePath,
          "demo",
          "plan/demo",
          graphYaml("something-else"),
        ),
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain('graph "id" is "something-else"');
    expect(result.message).toContain('expected "demo"');

    const recorded = latestOutcomeFor(cwd, "demo", "plan/demo");
    expect(recorded?.kind).toBe("held");
  }, 30_000);

  it("refuses to plan a graph id that is already approved", async () => {
    const cwd = fixture();
    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml("demo"));
    commitAll(cwd, "an approved graph");

    const approved = await runGraphApprove(["demo", "--by", "tester", "--because", "looks good"], {
      cwd,
    });
    expect(approved.exitCode).toBe(0);

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("approved");
  });

  it("refuses to plan over an existing graph id without --correction", async () => {
    const cwd = fixture();
    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml("demo"));
    commitAll(cwd, "an earlier, unapproved graph");

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("--correction");
  });

  it("delivers authoring guidance in the interpreter canonical brief and ordinary opening", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    let prompt: string | undefined;

    const result = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        prompt: (_agent, text) => {
          prompt = text;
          return Promise.resolve(ok(undefined));
        },
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });

    expect(result.exitCode).toBe(0);
    const briefPath = join(
      worktreePath,
      ".interlock",
      "sessions",
      "demo",
      "plan",
      "demo",
      "brief.md",
    );
    const read = await readBriefFile(briefPath);
    if (isErr(read) || read.value.kind !== "v1") {
      throw new Error("expected the worktree copy to read as brief@v1");
    }
    expect(read.value.body).not.toContain("## Context slice");
    expect(read.value.body).toContain("## Debrief authoring");
    if (prompt === undefined) throw new Error("expected an opening prompt");
    expect(prompt).toContain("Prompt projection, not a brief file.");
    expect(prompt).toContain("## Debrief authoring");
  }, 30_000);

  it("carries the previous ask forward when --correction omits --ask", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");

    const first = await runInterlockPlan(["demo", "--ask", "add a health check endpoint"], {
      cwd,
      clock: createControlledClock(),
      runtime: {
        ...stubRuntime(),
        waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
      },
    });
    expect(first.exitCode).toBe(0);

    const second = await runInterlockPlan(
      ["demo", "--correction", "the acceptance for only-node is not a sentence a gate can judge"],
      {
        cwd,
        clock: createControlledClock(),
        runtime: {
          ...stubRuntime(),
          waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
        },
      },
    );
    expect(second.exitCode).toBe(0);

    const briefPath = join(
      worktreePath,
      ".interlock",
      "sessions",
      "demo",
      "plan",
      "demo",
      "brief.md",
    );
    const read = await readBriefFile(briefPath);
    if (isErr(read) || read.value.kind !== "v1") {
      throw new Error("expected the worktree copy to read as brief@v1");
    }
    expect(read.value.body).toContain("> add a health check endpoint");
  }, 30_000);

  it("inherits a correction's context selector unless an explicit replacement is given", async () => {
    server = await startFakeSubstrateServer();
    server.responseFor("context", { items: [], vocabulary: "reference@v1" });
    const cwd = fixtureWithOrigin(localYamlFor(server.url));
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const runtime = {
      ...stubRuntime(),
      waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
    };
    const selected = [".interlock/config.yaml"];

    const first = await runInterlockPlan(
      ["demo", "--ask", "add context", "--context-scope", JSON.stringify(selected)],
      { cwd, clock: createControlledClock(), runtime },
    );
    const inherited = await runInterlockPlan(
      ["demo", "--correction", "make the graph more specific"],
      { cwd, clock: createControlledClock(), runtime },
    );
    const replaced = await runInterlockPlan(
      ["demo", "--correction", "query only the repository", "--context-scope", "[]"],
      { cwd, clock: createControlledClock(), runtime },
    );

    expect(first.exitCode).toBe(0);
    expect(inherited.exitCode).toBe(0);
    expect(replaced.exitCode).toBe(0);
    const requests = server.calls
      .filter((call) => call.verb === "context")
      .map((call) => call.body);
    expect(requests).toEqual([
      expect.objectContaining({ scope: selected }),
      expect.objectContaining({ scope: selected }),
      expect.objectContaining({ scope: [] }),
    ]);
  }, 30_000);

  it.each([
    ["no previous planner brief", undefined],
    ["a valid legacy planner brief", "# Earlier planner brief\n\nAn older plan.\n"],
  ])(
    "uses omitted context selection for an explicit correction with %s",
    async (_name, previousBrief) => {
      server = await startFakeSubstrateServer();
      server.responseFor("context", { items: [], vocabulary: "reference@v1" });
      const cwd = fixtureWithOrigin(localYamlFor(server.url));
      writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml("demo"));
      if (previousBrief !== undefined) {
        const previousBriefPath = join(
          cwd,
          ".interlock",
          "sessions",
          "demo",
          "plan",
          "demo",
          "brief.md",
        );
        mkdirSync(dirname(previousBriefPath), { recursive: true });
        writeFileSync(previousBriefPath, previousBrief);
      }
      commitAll(cwd, "an earlier unapproved graph");

      const worktreePath = join(cwd, ".worktrees", "plan", "demo");
      const result = await runInterlockPlan(
        ["demo", "--ask", "make the graph more specific", "--correction", "repair context"],
        {
          cwd,
          clock: createControlledClock(),
          runtime: {
            ...stubRuntime(),
            waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
          },
        },
      );

      expect(result.exitCode).toBe(0);
      const authoritativeScope = execFileSync("git", ["ls-files"], {
        cwd,
        encoding: "utf-8",
      })
        .trim()
        .split("\n");
      expect(server.calls.find((call) => call.verb === "context")?.body).toMatchObject({
        scope: authoritativeScope,
      });
      const brief = await readBriefFile(
        join(worktreePath, ".interlock", "sessions", "demo", "plan", "demo", "brief.md"),
      );
      if (isErr(brief) || brief.value.kind !== "v1") {
        throw new Error("expected a planning brief");
      }
      expect(brief.value.frontMatter.contextScope).toBeUndefined();
      expect(brief.value.frontMatter.scope).toEqual(authoritativeScope);
    },
    30_000,
  );

  it.each([
    ["malformed", "---\ngraph: [unterminated\n---\n"],
    ["unknown", "---\ninterlock: brief@v9\n---\n"],
    ["invalid", "---\ninterlock: brief@v1\ngraph: demo\n---\n"],
  ])(
    "refuses a present %s planner brief before context dispatch or session state",
    async (_name, previousBrief) => {
      server = await startFakeSubstrateServer();
      server.responseFor("context", { items: [], vocabulary: "reference@v1" });
      const cwd = fixtureWithOrigin(localYamlFor(server.url));
      writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml("demo"));
      const previousBriefPath = join(
        cwd,
        ".interlock",
        "sessions",
        "demo",
        "plan",
        "demo",
        "brief.md",
      );
      mkdirSync(dirname(previousBriefPath), { recursive: true });
      writeFileSync(previousBriefPath, previousBrief);
      commitAll(cwd, "an earlier unapproved graph");

      const result = await runInterlockPlan(
        ["demo", "--ask", "make the graph more specific", "--correction", "repair context"],
        { cwd, clock: createControlledClock(), runtime: stubRuntime() },
      );

      expect(result.exitCode).toBe(1);
      expect(server.calls.filter((call) => call.verb === "context")).toEqual([]);
      const journalPath = join(cwd, ".interlock", "ledger", "journal.jsonl");
      const events =
        existsSync(journalPath) && readFileSync(journalPath, "utf-8").trim().length > 0
          ? readFileSync(journalPath, "utf-8")
              .trim()
              .split("\n")
              .map((line): unknown => JSON.parse(line))
              .filter(isLedgerEvent)
          : [];
      expect(
        events.filter((event) => event.kind === "session-started" || event.kind === "lease-taken"),
      ).toEqual([]);
    },
    30_000,
  );

  it.each([
    ["malformed JSON", ["--context-scope", "not-json"]],
    ["non-array JSON", ["--context-scope", "{}"]],
    ["non-string member", ["--context-scope", '[".interlock/config.yaml", 1]']],
    ["missing value", ["--context-scope"]],
    ["repeated flag", ["--context-scope", "[]", "--context-scope", "[]"]],
    ["duplicate path", ["--context-scope", '[".interlock/config.yaml", ".interlock/config.yaml"]']],
    ["untracked path", ["--context-scope", '["missing.ts"]']],
    ["normalizable alias", ["--context-scope", '[".interlock/./config.yaml"]']],
  ])(
    "refuses a %s context selector before sending context or creating a session",
    async (_name, selector) => {
      server = await startFakeSubstrateServer();
      server.responseFor("context", { items: [], vocabulary: "reference@v1" });
      const cwd = fixture(localYamlFor(server.url));

      const result = await runInterlockPlan(["demo", "--ask", "add context", ...selector], {
        cwd,
        clock: createControlledClock(),
        runtime: stubRuntime(),
      });

      expect(result.exitCode).toBe(1);
      expect(server.calls.filter((call) => call.verb === "context")).toEqual([]);
      const journalPath = join(cwd, ".interlock", "ledger", "journal.jsonl");
      const events =
        existsSync(journalPath) && readFileSync(journalPath, "utf-8").trim().length > 0
          ? readFileSync(journalPath, "utf-8")
              .trim()
              .split("\n")
              .map((line): unknown => JSON.parse(line))
              .filter(isLedgerEvent)
          : [];
      expect(
        events.filter((event) => event.kind === "session-started" || event.kind === "lease-taken"),
      ).toEqual([]);
      expect(
        existsSync(
          join(
            cwd,
            ".worktrees",
            "plan",
            "demo",
            ".interlock",
            "sessions",
            "demo",
            "plan",
            "demo",
            "brief.md",
          ),
        ),
      ).toBe(false);
    },
  );

  it("refuses an inherited correction selector that is no longer tracked before creating a session", async () => {
    const cwd = fixture();
    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const runtime = {
      ...stubRuntime(),
      waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
    };
    const first = await runInterlockPlan(
      ["demo", "--ask", "add context", "--context-scope", '[".interlock/config.yaml"]'],
      { cwd, clock: createControlledClock(), runtime },
    );
    expect(first.exitCode).toBe(0);

    const journalPath = join(cwd, ".interlock", "ledger", "journal.jsonl");
    const before = readFileSync(journalPath, "utf-8")
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line))
      .filter(isLedgerEvent)
      .filter((event) => event.kind === "session-started" || event.kind === "lease-taken");
    execFileSync("git", ["rm", "--cached", ".interlock/config.yaml"], { cwd });

    const correction = await runInterlockPlan(
      ["demo", "--correction", "the selected context path is no longer tracked"],
      { cwd, clock: createControlledClock(), runtime },
    );

    expect(correction.exitCode).toBe(1);
    expect(correction.message).toContain("not an exact tracked path");
    const after = readFileSync(journalPath, "utf-8")
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line))
      .filter(isLedgerEvent)
      .filter((event) => event.kind === "session-started" || event.kind === "lease-taken");
    expect(after).toEqual(before);
  }, 30_000);

  it("a correction reopens with the reason as the brief's first paragraph and the reason narrated", async () => {
    const cwd = fixture();
    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml("demo"));
    commitAll(cwd, "an earlier, unapproved graph");

    const worktreePath = join(cwd, ".worktrees", "plan", "demo");
    const lines: string[] = [];

    const result = await runInterlockPlan(
      [
        "demo",
        "--ask",
        "add a health check endpoint",
        "--correction",
        "the acceptance for only-node is not a sentence a gate can judge",
      ],
      {
        cwd,
        clock: createControlledClock(),
        runtime: {
          ...stubRuntime(),
          waitUntil: finishedWaitUntil(worktreePath, "demo", "plan/demo", graphYaml("demo")),
        },
        narrate: (line) => lines.push(line),
      },
    );

    expect(result.exitCode).toBe(0);
    expect(
      lines.some((line) =>
        line.includes("the acceptance for only-node is not a sentence a gate can judge"),
      ),
    ).toBe(true);

    const briefPath = join(
      worktreePath,
      ".interlock",
      "sessions",
      "demo",
      "plan",
      "demo",
      "brief.md",
    );
    const read = await readBriefFile(briefPath);
    if (isErr(read) || read.value.kind !== "v1") {
      throw new Error("expected the worktree copy to read as brief@v1");
    }
    const paragraphs = read.value.body
      .split("\n\n")
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0);
    const [title, firstProseParagraph] = paragraphs;
    expect(title).toContain("# Brief");
    expect(firstProseParagraph).toContain(
      "the acceptance for only-node is not a sentence a gate can judge",
    );
    expect(read.value.body).toContain("## Corrected from");
    expect(read.value.body).toContain("id: demo");
  }, 30_000);

  it("refuses --correction against a graph id with no existing graph file", async () => {
    const cwd = fixture();
    const result = await runInterlockPlan(
      ["never-planned", "--ask", "add a health check endpoint", "--correction", "try again"],
      { cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.message).toContain("no such file");
  });
});
