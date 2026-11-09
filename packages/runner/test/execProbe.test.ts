import { isErr, ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import type { PreparedLaunch } from "../src/runtime.ts";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { execProbeInvocation, runProbeChecks } from "../src/runtimeProbe.ts";

const headless = { before: ["--headless"], after: ["--prompt"] };

function runtime(
  overrides: Partial<ResolvedRuntime> = {},
  configuredHeadless: typeof headless | null = headless,
): ResolvedRuntime {
  return {
    name: "fixture",
    source: "catalogue",
    commits: "agent",
    kind: "exec",
    args: ["fixture-agent", "--safe"],
    model: "fixture-model",
    startupAnswers: [],
    startupTimeoutMs: 1,
    promptTakenTimeoutMs: 1,
    readySettleMs: 0,
    promptRetries: 0,
    writableRootArgs: undefined,
    ...(configuredHeadless === null ? {} : { headlessArgs: configuredHeadless }),
    exec: { before: ["fixture-agent", "--safe", "--headless"], after: ["--prompt"] },
    ...overrides,
  };
}

const launch: PreparedLaunch = {
  program: "fixture-agent",
  args: ["--safe", "--headless", "{prompt}", "--prompt"],
  cwd: "/worktree",
  environment: { KEEP_NAME: "kept" },
  writableRoots: ["/common", "/worktree/.git"],
};

describe("headless exec probes", () => {
  it("replaces the declared headless prompt tail without changing access arguments", () => {
    const result = execProbeInvocation(runtime(), launch, "loopback");

    expect(result).toEqual(
      ok({
        argv: ["fixture-agent", "--safe", "--headless", "interlock-probe-loopback", "--prompt"],
        cwd: "/worktree",
        environment: { KEEP_NAME: "kept" },
      }),
    );
  });

  it("passes prepared roots, MCP policy, and forwarded names to the probed process", () => {
    const configured = runtime({
      args: ["fixture-agent", "{writable_roots}"],
      writableRootArgs: { before: ["--root"], after: [] },
      mcpServers: ["filesystem", "database"],
      mcpAllow: ["filesystem"],
      mcpExclusive: {
        disableAll: ["--disable-all-mcp"],
        allowEach: { before: ["--allow-mcp"], after: [] },
      },
      environmentPassthrough: ["KEEP_NAME"],
      environmentForwardArgs: { before: ["--forward"], after: [] },
      exec: {
        before: ["fixture-agent", "--headless"],
        after: [
          "--prompt",
          "--disable-all-mcp",
          "--allow-mcp",
          "filesystem",
          "--forward",
          "KEEP_NAME",
        ],
      },
    });
    const result = execProbeInvocation(
      configured,
      {
        ...launch,
        args: [
          "--root",
          "/common",
          "--root",
          "/worktree/.git",
          "--headless",
          "{prompt}",
          "--prompt",
          "--disable-all-mcp",
          "--allow-mcp",
          "filesystem",
          "--forward",
          "KEEP_NAME",
        ],
        environment: { KEEP_NAME: "kept" },
        writableRoots: ["/common", "/worktree/.git"],
      },
      "loopback",
    );

    expect(result).toEqual(
      ok({
        argv: [
          "fixture-agent",
          "--root",
          "/common",
          "--root",
          "/worktree/.git",
          "--headless",
          "interlock-probe-loopback",
          "--prompt",
          "--disable-all-mcp",
          "--allow-mcp",
          "filesystem",
          "--forward",
          "KEEP_NAME",
        ],
        cwd: "/worktree",
        environment: { KEEP_NAME: "kept" },
      }),
    );
  });

  it("refuses a headless probe template that puts the command before the program", async () => {
    const processRuns: string[][] = [];
    const results = await runProbeChecks({
      runtime: runtime({ exec: { before: ["interlock-probe-shm", "fixture-agent"], after: [] } }),
      launch,
      processRunner: async (invocation) => {
        processRuns.push([...invocation.argv]);
        return { code: 0, output: "" };
      },
    });

    expect(results.every((result) => result.state === "unavailable")).toBe(true);
    expect(processRuns).toEqual([]);
  });

  it("reports an exec profile without headless_args as unavailable before spawning", async () => {
    const processRuns: string[][] = [];
    const results = await runProbeChecks({
      runtime: runtime({}, null),
      launch,
      processRunner: async (invocation) => {
        processRuns.push([...invocation.argv]);
        return { code: 0, output: "" };
      },
    });

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.state === "unavailable")).toBe(true);
    expect(results[0]).toEqual({
      check: "shm",
      state: "unavailable",
      reason: "exec profile has no headless_args; probe access split is undeclared",
    });
    expect(processRuns).toEqual([]);
  });

  it("does not pass when a real check process exits nonzero", async () => {
    const results = await runProbeChecks({
      runtime: runtime(),
      launch,
      processRunner: async () => ({ code: 1, output: "shared memory denied" }),
      runnerSignedCommit: async () => ok(undefined),
    });

    expect(results[0]).toEqual({
      check: "shm",
      state: "refused",
      error: "shared memory denied",
    });
    expect(results.every((result) => result.state === "refused")).toBe(true);
  });

  it("releases a bound probe when its process runner throws", async () => {
    const identities: {
      readonly pid: number;
      readonly pgid: number;
      readonly birth: string;
      readonly boot: string;
    }[] = [];
    const releases: { readonly outcome: string; readonly pgid: string }[] = [];
    const results = await runProbeChecks({
      runtime: runtime(),
      launch,
      processLifecycleFor: async () =>
        ok({
          bind: async (identity) => {
            identities.push(identity);
            return ok(undefined);
          },
          release: async (outcome, pgid) => {
            releases.push({ outcome, pgid });
            return ok(undefined);
          },
        }),
      processRunner: async (_invocation, lifecycle) => {
        if (lifecycle === undefined) throw new Error("missing lifecycle");
        await lifecycle.bind({ pid: 41, pgid: 41, birth: "birth", boot: "boot" });
        throw new Error("probe process threw");
      },
    });

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.state === "refused")).toBe(true);
    expect(results[0]).toEqual({ check: "shm", state: "refused", error: "probe process threw" });
    expect(identities).toHaveLength(5);
    expect(releases).toEqual([
      { outcome: "override", pgid: "" },
      { outcome: "override", pgid: "" },
      { outcome: "override", pgid: "" },
      { outcome: "override", pgid: "" },
      { outcome: "override", pgid: "" },
    ]);
  });

  it("keeps invalid templates from reaching a process runner", () => {
    const result = execProbeInvocation(
      runtime({ exec: { before: ["host-shell", "-c"], after: [] } }),
      launch,
      "shm",
    );

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error).toContain("fixture-agent");
  });
});
