import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { err, ok } from "@phyxiusjs/fp";
import { isLedgerEvent } from "ledger";
import type { Runtime } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { commitAll, gitInitFixture } from "./graph/gitFixture.ts";
import { runGraphApprove } from "../src/graph/approve.ts";
import { runInterlockRun } from "../src/run.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    acceptance: a trivial node",
  "    depends_on: []",
  "    gates:",
  "      - id: own-gate",
  "        kind: command",
  '        run: "true"',
  "",
].join("\n");

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

const localYamlWithStartupAnswers = [
  "interlock: local@v0",
  "runtime:",
  "  kind: claude",
  "  args: []",
  "  startup_answers:",
  '    - matches: "trust this project"',
  "      keys:",
  "        - Down",
  "        - Enter",
  "worktree_root: .worktrees",
  "lease_ms: 60000",
  "run_timeout_ms: 5000",
  "substrate:",
  "  address: none",
  "",
].join("\n");

function localYamlWithWorktreeSetup(...commands: readonly string[]): string {
  return [
    "interlock: local@v0",
    "runtime:",
    "  kind: claude",
    "  args: []",
    "worktree_root: .worktrees",
    "worktree_setup:",
    ...commands.map((command) => `  - "${command}"`),
    "lease_ms: 60000",
    "run_timeout_ms: 5000",
    "substrate:",
    "  address: none",
    "",
  ].join("\n");
}

function fixture(
  options: {
    readonly withLocal?: boolean;
    readonly withBrief?: boolean;
    readonly localYaml?: string;
  } = {},
): string {
  directory = mkdtempSync(join(runsRoot, "run-"));
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYaml,
  );
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  if (options.withLocal !== false) {
    writeFileSync(
      join(directory, ".interlock", "local.yaml"),
      options.localYaml ?? localYaml,
    );
  }
  if (options.withBrief !== false) {
    mkdirSync(join(directory, ".interlock", "sessions", "demo", "a"), {
      recursive: true,
    });
    writeFileSync(
      join(directory, ".interlock", "sessions", "demo", "a", "brief.md"),
      "# brief\n",
    );
  }
  gitInitFixture(directory);
  commitAll(directory, "fixture content");
  return directory;
}

function headSha(cwd: string): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf-8",
  }).trim();
}

function stubRuntime(): Runtime {
  return {
    openPane: () => Promise.resolve(ok({ id: "pane-1" })),
    startAgent: (pane) => Promise.resolve(ok({ id: "agent-1", pane })),
    reportIdentity: () => Promise.resolve(ok(undefined)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
}

describe("interlock run", () => {
  it("refuses without a graph and node", async () => {
    const result = await runInterlockRun([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock run");
  });

  it("refuses a graph that has no file on disk", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
    writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
    writeFileSync(join(directory, ".interlock", "local.yaml"), localYaml);
    gitInitFixture(directory);
    commitAll(directory, "fixture content");

    const result = await runInterlockRun(["demo", "a"], { cwd: directory });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses without local.yaml, naming the fields", async () => {
    const cwd = fixture({ withLocal: false });
    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("local.yaml");
    expect(result.message).toContain("worktree_root");
  });

  it("refuses a graph that has not been approved", async () => {
    const cwd = fixture();
    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("not approved");
  });

  it("refuses a node that is not declared on the graph", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    const result = await runInterlockRun(["demo", "no-such-node"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no-such-node");
  });

  it("refuses a node with no brief, without leasing it", async () => {
    const cwd = fixture({ withBrief: false });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    const journalBefore = readFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      "utf-8",
    );

    const result = await runInterlockRun(["demo", "a"], { cwd });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no brief");
    const journalAfter = readFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      "utf-8",
    );
    expect(journalAfter).toBe(journalBefore);
  });

  it("leases, worktrees, drives the injected runtime and gates a real node end to end", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime: stubRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("cleared");
    expect(existsSync(join(cwd, ".worktrees", "a"))).toBe(true);
  }, 30_000);

  it("narrates once when the runtime reports it waited for the pane's shell", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      startAgent: (pane, _kind, _args, onWaitingForPane) => {
        onWaitingForPane?.();
        return Promise.resolve(ok({ id: "agent-1", pane }));
      },
    };
    const lines: string[] = [];

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(
      lines.filter((line) => line === "waiting for the pane's shell"),
    ).toHaveLength(1);
  }, 30_000);

  it("bases the worktree on the repository's HEAD at run time, not the approval receipt's commit", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );
    const approvalSha = headSha(cwd);

    writeFileSync(join(cwd, "merged-after-approval.txt"), "a later merge\n");
    commitAll(cwd, "merge landed after approval");
    const headAtRunTime = headSha(cwd);
    expect(headAtRunTime).not.toBe(approvalSha);

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime: stubRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(headSha(join(cwd, ".worktrees", "a"))).toBe(headAtRunTime);
    expect(
      existsSync(join(cwd, ".worktrees", "a", "merged-after-approval.txt")),
    ).toBe(true);

    const journal = readFileSync(
      join(cwd, ".interlock", "ledger", "journal.jsonl"),
      "utf-8",
    );
    const started = journal
      .trim()
      .split("\n")
      .map((line): unknown => JSON.parse(line))
      .filter(isLedgerEvent)
      .find((event) => event.kind === "session-started");
    if (started === undefined || started.kind !== "session-started") {
      throw new Error("expected a session-started event in the journal");
    }
    expect(started.graphBaseSha).toBe(headAtRunTime);
    expect(started.graphBaseSha).not.toBe(approvalSha);
  }, 30_000);

  it("sends the opening prompt exactly once, after reportIdentity and before waitUntil, naming the brief path", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const calls: string[] = [];
    let promptText: string | undefined;
    const runtime: Runtime = {
      ...stubRuntime(),
      reportIdentity: (...args) => {
        calls.push("reportIdentity");
        return stubRuntime().reportIdentity(...args);
      },
      prompt: (agent, text) => {
        calls.push("prompt");
        promptText = text;
        return stubRuntime().prompt(agent, text);
      },
      waitUntil: (agent, until, timeoutMs) => {
        calls.push(`waitUntil:${until.join(",")}`);
        return stubRuntime().waitUntil(agent, until, timeoutMs);
      },
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
    });

    expect(result.exitCode).toBe(0);
    expect(calls.filter((call) => call === "prompt")).toHaveLength(1);
    expect(calls.indexOf("prompt")).toBeGreaterThan(
      calls.indexOf("reportIdentity"),
    );
    expect(calls.indexOf("prompt")).toBeLessThan(
      calls.indexOf("waitUntil:working,blocked,done"),
    );
    expect(promptText).toContain(".interlock/sessions/demo/a/brief.md");
  }, 30_000);

  it("writes the brief into the worktree even though it is not yet committed in the repository", async () => {
    directory = mkdtempSync(join(runsRoot, "run-"));
    const cwd = directory;
    mkdirSync(join(cwd, ".interlock", "graphs"), { recursive: true });
    writeFileSync(join(cwd, ".interlock", "graphs", "demo.yaml"), graphYaml);
    writeFileSync(join(cwd, ".interlock", "config.yaml"), configYaml);
    writeFileSync(join(cwd, ".interlock", "local.yaml"), localYaml);
    gitInitFixture(cwd);
    commitAll(cwd, "graph content");

    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    mkdirSync(join(cwd, ".interlock", "sessions", "demo", "a"), {
      recursive: true,
    });
    writeFileSync(
      join(cwd, ".interlock", "sessions", "demo", "a", "brief.md"),
      "# brief\n",
    );

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime: stubRuntime(),
    });

    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("cleared");
    const briefInWorktree = join(
      cwd,
      ".worktrees",
      "a",
      ".interlock",
      "sessions",
      "demo",
      "a",
      "brief.md",
    );
    expect(existsSync(briefInWorktree)).toBe(true);
    expect(readFileSync(briefInWorktree, "utf-8")).toBe("# brief\n");
  }, 30_000);

  it("narrates each step to stdout as it happens, ending on the wait before the judgement", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const lines: string[] = [];
    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    const sessionMatch = result.message.match(/session ([^,]+),/);
    if (sessionMatch === null) {
      throw new Error("expected a session id in the result message");
    }
    const [, sessionId] = sessionMatch;

    expect(lines).toEqual([
      `leased a (session ${sessionId}, expires 1970-01-01T00:01:00.000Z)`,
      `worktree at ${join(cwd, ".worktrees", "a")} on ${headSha(cwd)}`,
      "brief written",
      "pane pane-1 opened",
      "agent agent-1 started (claude)",
      "identity reported",
      "agent ready (idle)",
      "prompt sent",
      "waiting for idle, blocked or done (timeout 5000ms)",
    ]);
  }, 30_000);

  it("narrates 'agent working' once the agent moves off idle, before the long wait", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.includes("working")
          ? Promise.resolve(ok("working"))
          : stubRuntime().waitUntil(agent, until, timeoutMs),
    };
    const lines: string[] = [];

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    const sessionMatch = result.message.match(/session ([^,]+),/);
    if (sessionMatch === null) {
      throw new Error("expected a session id in the result message");
    }
    const [, sessionId] = sessionMatch;

    expect(lines).toEqual([
      `leased a (session ${sessionId}, expires 1970-01-01T00:01:00.000Z)`,
      `worktree at ${join(cwd, ".worktrees", "a")} on ${headSha(cwd)}`,
      "brief written",
      "pane pane-1 opened",
      "agent agent-1 started (claude)",
      "identity reported",
      "agent ready (idle)",
      "prompt sent",
      "agent working",
      "waiting for idle, blocked or done (timeout 5000ms)",
    ]);
  }, 30_000);

  it("refuses when the agent is still idle after the prompt-taken timeout, naming it, not the run timeout", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.includes("working")
          ? Promise.resolve(
              err({ kind: "timeout", until, timeoutMs, status: "idle" }),
            )
          : stubRuntime().waitUntil(agent, until, timeoutMs),
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "prompt taken refused: prompt not taken after 20000ms; agent still idle",
    );
  }, 30_000);

  it("narrates a runtime refusal at the moment it happens and does not leave the lease dangling silently", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      startAgent: () =>
        Promise.resolve(
          err({ kind: "transport", because: "agent CLI crashed" }),
        ),
    };

    const lines: string[] = [];
    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe("agent start refused: agent CLI crashed");
    expect(lines).toHaveLength(6);
    expect(lines[0]).toMatch(
      /^leased a \(session .+, expires 1970-01-01T00:01:00\.000Z\)$/,
    );
    expect(lines.slice(1)).toEqual([
      `worktree at ${join(cwd, ".worktrees", "a")} on ${headSha(cwd)}`,
      "brief written",
      "pane pane-1 opened",
      "agent start refused: agent CLI crashed",
      "lease not renewed; the sweeper will collect it at 1970-01-01T00:01:00.000Z",
    ]);
  }, 30_000);

  it("answers a startup dialog with the configured keys before sending the prompt", async () => {
    const cwd = fixture({ localYaml: localYamlWithStartupAnswers });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    let blocked = true;
    const sentKeys: (readonly string[])[] = [];
    const lines: string[] = [];
    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.length === 2
          ? Promise.resolve(ok(blocked ? "blocked" : "idle"))
          : stubRuntime().waitUntil(agent, until, timeoutMs),
      read: () => Promise.resolve(ok("trust this project? [Down/Enter]")),
      sendKeys: (_agent, keys) => {
        sentKeys.push(keys);
        blocked = false;
        return Promise.resolve(ok(undefined));
      },
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(sentKeys).toEqual([["Down", "Enter"]]);
    const sentIndex = lines.indexOf("startup answer sent (trust this project)");
    expect(sentIndex).toBeGreaterThan(-1);
    expect(sentIndex).toBeLessThan(lines.indexOf("prompt sent"));
  }, 30_000);

  it("refuses when the agent stays blocked at startup with no configured answer", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.length === 2
          ? Promise.resolve(ok("blocked"))
          : stubRuntime().waitUntil(agent, until, timeoutMs),
      read: () =>
        Promise.resolve(ok("Is this a project you created or one you trust?")),
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "agent blocked at startup with no configured answer; screen: Is this a project you created or one you trust?",
    );
  }, 30_000);

  it("waits through unknown, then blocked, then idle before sending the prompt", async () => {
    const cwd = fixture({ localYaml: localYamlWithStartupAnswers });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const statuses: ("unknown" | "blocked" | "idle")[] = [
      "unknown",
      "blocked",
      "idle",
    ];
    const lines: string[] = [];
    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.length === 2
          ? Promise.resolve(ok(statuses.shift() ?? "idle"))
          : stubRuntime().waitUntil(agent, until, timeoutMs),
      read: () => Promise.resolve(ok("trust this project? [Down/Enter]")),
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(statuses).toHaveLength(0);
    const answered = lines.indexOf("startup answer sent (trust this project)");
    const ready = lines.indexOf("agent ready (idle)");
    const prompted = lines.indexOf("prompt sent");
    expect(answered).toBeGreaterThan(-1);
    expect(ready).toBeGreaterThan(answered);
    expect(prompted).toBeGreaterThan(ready);
  }, 30_000);

  it("refuses with the last observed status when the agent never becomes ready", async () => {
    const cwd = fixture();
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const runtime: Runtime = {
      ...stubRuntime(),
      waitUntil: (agent, until, timeoutMs) =>
        until.length === 2
          ? Promise.resolve(
              err({ kind: "timeout", until, timeoutMs, status: "working" }),
            )
          : stubRuntime().waitUntil(agent, until, timeoutMs),
    };

    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock(),
      runtime,
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe(
      "startup refused: agent not ready after 60000ms; last status working",
    );
  }, 30_000);

  it("runs worktree_setup commands in the worktree before the pane opens, narrating each", async () => {
    const cwd = fixture({
      localYaml: localYamlWithWorktreeSetup("true", "true"),
    });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const lines: string[] = [];
    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(0);
    expect(lines.indexOf("worktree setup: true")).toBeGreaterThan(
      lines.indexOf("brief written"),
    );
    expect(
      lines.filter((line) => line === "worktree setup: true"),
    ).toHaveLength(2);
    expect(lines.indexOf("pane pane-1 opened")).toBeGreaterThan(
      lines.lastIndexOf("worktree setup: true"),
    );
  }, 30_000);

  it("refuses on a failing worktree_setup command, naming it and its exit code, without opening a pane", async () => {
    const cwd = fixture({
      localYaml: localYamlWithWorktreeSetup("false"),
    });
    await runGraphApprove(
      ["demo", "--by", "Rodrigo Sasaki", "--because", "looks right"],
      { cwd },
    );

    const lines: string[] = [];
    const result = await runInterlockRun(["demo", "a"], {
      cwd,
      clock: createControlledClock({ initialTime: 0 }),
      runtime: stubRuntime(),
      narrate: (line) => lines.push(line),
    });

    expect(result.exitCode).toBe(1);
    expect(result.message).toBe('worktree setup refused: "false" exited 1.');
    expect(lines).toContain("worktree setup: false");
    expect(lines).not.toContain("pane pane-1 opened");
    expect(lines.at(-1)).toBe(
      "lease not renewed; the sweeper will collect it at 1970-01-01T00:01:00.000Z",
    );
  }, 30_000);
});
