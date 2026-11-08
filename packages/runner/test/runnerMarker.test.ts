import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { err, isOk, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentEnvironmentArgs } from "../src/codex/environment.ts";
import { runExecPhase } from "../src/execRuntime.ts";
import { mergeRunnerMarker, runnerMarker } from "../src/runnerMarker.ts";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { prepareLaunch } from "../src/sessionDrive.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  vi.unstubAllEnvs();
});

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "runner-marker-"));
  return directory;
}

function codexHome(root: string, servers: readonly string[]): string {
  const home = join(root, "codex-home");
  mkdirSync(home);
  writeFileSync(
    join(home, "config.toml"),
    servers.map((name) => `[mcp_servers.${name}]\ncommand = "${name}"\n`).join("\n"),
  );
  return home;
}

function codexRuntime(): ResolvedRuntime {
  return {
    name: "codex",
    source: "catalogue",
    commits: "agent",
    kind: "codex",
    args: ["--quiet"],
    model: "fixture-model",
    startupAnswers: [],
    startupTimeoutMs: 1,
    promptTakenTimeoutMs: 1,
    readySettleMs: 0,
    promptRetries: 0,
    writableRootArgs: undefined,
  };
}

describe("runner marker", () => {
  it("adds shell and stdio MCP overrides for every marker key", () => {
    const environment = mergeRunnerMarker({}, runnerMarker("session", "graph", "node"));
    expect(isOk(environment)).toBe(true);
    if (!isOk(environment)) return;
    const args = agentEnvironmentArgs("codex", [], environment.value, ["stdio.one", "stdio-two"]);
    expect(args).toContain("-c");
    expect(args).toContain('shell_environment_policy.set.INTERLOCK_SESSION="session"');
    expect(args).toContain('mcp_servers."stdio.one".env.INTERLOCK_SESSION="session"');
    expect(args).toContain('mcp_servers.stdio-two.env.INTERLOCK_NODE="node"');
  });

  it("uses only stdio servers reported by codex mcp list", () => {
    const root = fixtureRoot();
    const launch = prepareLaunch(
      codexRuntime(),
      root,
      {
        INTERLOCK_SESSION: "session",
        INTERLOCK_GRAPH: "graph",
        INTERLOCK_NODE: "node",
        CODEX_HOME: codexHome(root, ["stdio-one", '"stdio.two"']),
      },
      {
        listCodexMcp: () => ok(["stdio-one", "stdio.two"]),
      },
    );
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.args).toContain('mcp_servers.stdio-one.env.INTERLOCK_SESSION="session"');
    expect(launch.value.args).toContain('mcp_servers."stdio.two".env.INTERLOCK_GRAPH="graph"');
    expect(launch.value.args.some((arg) => arg.includes("http"))).toBe(false);
  });

  it("reads the codex MCP list command from PATH", () => {
    const root = fixtureRoot();
    const bin = join(root, "bin");
    mkdirSync(bin);
    const codex = join(bin, "codex");
    writeFileSync(
      codex,
      "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify([{name:'stdio',transport:{type:'stdio'}},{name:'http',transport:{type:'http'}}]));\n",
    );
    chmodSync(codex, 0o755);
    vi.stubEnv("PATH", `${bin}:${process.env["PATH"] ?? ""}`);
    const launch = prepareLaunch(codexRuntime(), root, {
      INTERLOCK_SESSION: "session",
      INTERLOCK_GRAPH: "graph",
      INTERLOCK_NODE: "node",
      CODEX_HOME: codexHome(root, ["stdio"]),
    });
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.args).toContain('mcp_servers.stdio.env.INTERLOCK_NODE="node"');
    expect(launch.value.args.some((arg) => arg.includes("http"))).toBe(false);
  });

  it("carries marker values from Codex launch args into a probe server", () => {
    const root = fixtureRoot();
    const bin = join(root, "bin");
    mkdirSync(bin);
    const codex = join(bin, "codex");
    copyFileSync(join(import.meta.dirname, "fixtures", "exec", "codexProbe.mjs"), codex);
    chmodSync(codex, 0o755);
    const output = join(root, "probe.jsonl");
    const environment = {
      INTERLOCK_SESSION: "session",
      INTERLOCK_GRAPH: "graph",
      INTERLOCK_NODE: "node",
      INTERLOCK_PROBE_SCRIPT: join(
        import.meta.dirname,
        "fixtures",
        "exec",
        "appendEnvironment.mjs",
      ),
      INTERLOCK_PROBE_OUTPUT: output,
      CODEX_HOME: codexHome(root, ["probe"]),
    };
    const launch = prepareLaunch(codexRuntime(), root, environment, {
      listCodexMcp: () => ok(["probe"]),
    });
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(() =>
      execFileSync(process.execPath, [codex, ...launch.value.args], {
        cwd: root,
        env: { ...process.env, ...launch.value.environment },
        encoding: "utf8",
      }),
    ).not.toThrow();
    expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
      INTERLOCK_SESSION: "session",
      INTERLOCK_GRAPH: "graph",
      INTERLOCK_NODE: "node",
    });
  });

  it("leaves MCP overrides out when listing fails or is empty", () => {
    const environment = {
      INTERLOCK_SESSION: "session",
      INTERLOCK_GRAPH: "graph",
      INTERLOCK_NODE: "node",
    };
    const narration: string[] = [];
    const failed = prepareLaunch(codexRuntime(), fixtureRoot(), environment, {
      narrate: (line) => narration.push(line),
      listCodexMcp: () => err("fixture failed"),
    });
    expect(isOk(failed)).toBe(true);
    if (!isOk(failed)) return;
    expect(failed.value.args.some((arg) => arg.startsWith("mcp_servers."))).toBe(false);
    expect(narration).toEqual(["codex mcp list --json failed: fixture failed"]);
    const emptyNarration: string[] = [];
    const empty = prepareLaunch(codexRuntime(), fixtureRoot(), environment, {
      narrate: (line) => emptyNarration.push(line),
      listCodexMcp: () => ok([]),
    });
    expect(isOk(empty)).toBe(true);
    expect(emptyNarration).toEqual(["codex mcp list --json returned no stdio servers"]);
  });

  it("refuses a different machine marker value", () => {
    const result = mergeRunnerMarker(
      { INTERLOCK_SESSION: "other" },
      runnerMarker("session", "graph", "node"),
    );
    expect(result).toEqual(
      err({
        kind: "marker-conflict",
        key: "INTERLOCK_SESSION",
        existing: "other",
        expected: "session",
      }),
    );
  });

  it("passes the marker to an exec phase child", async () => {
    const root = fixtureRoot();
    const recorded = join(root, "environment.json");
    const result = await runExecPhase({
      runRoot: join(root, "interlock", "runs"),
      phase: "work",
      graph: "graph",
      node: "node",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "recordEnvironment.mjs"), recorded],
      prompt: "unused",
      cwd: root,
      env: {
        INTERLOCK_SESSION: "session",
        INTERLOCK_GRAPH: "graph",
        INTERLOCK_NODE: "node",
      },
      timeoutMs: 5_000,
      termGraceMs: 1_000,
      drainGraceMs: 1_000,
    });
    expect(isOk(result)).toBe(true);
    expect(JSON.parse(readFileSync(recorded, "utf8"))).toEqual({
      INTERLOCK_SESSION: "session",
      INTERLOCK_GRAPH: "graph",
      INTERLOCK_NODE: "node",
    });
  });
});
