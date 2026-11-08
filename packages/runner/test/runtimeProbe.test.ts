import { isErr, ok } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import type { PreparedLaunch } from "../src/runtime.ts";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { execProbeInvocation, runProbeChecks } from "../src/runtimeProbe.ts";

function runtime(exec: ResolvedRuntime["exec"]): ResolvedRuntime {
  return {
    name: "fixture",
    source: "catalogue",
    commits: "agent",
    kind: "fixture-agent",
    args: ["--safe"],
    model: "fixture-model",
    startupAnswers: [],
    startupTimeoutMs: 1,
    promptTakenTimeoutMs: 1,
    readySettleMs: 0,
    promptRetries: 0,
    writableRootArgs: undefined,
    ...(exec === undefined ? {} : { exec }),
  };
}

const launch: PreparedLaunch = {
  program: "fixture-agent",
  args: ["--safe", "--root", "/common", "--env", "VALUE"],
  cwd: "/worktree",
  environment: { VALUE: "one" },
  writableRoots: ["/common"],
};

describe("runtime probe execution", () => {
  it("expands an exec template with access arguments before the check command", () => {
    const result = execProbeInvocation(
      runtime({ before: ["fixture-agent", "--safe"], after: [] }),
      launch,
      "shm",
    );

    expect(result).toEqual(
      ok({
        argv: [
          "fixture-agent",
          "--safe",
          "--root",
          "/common",
          "--env",
          "VALUE",
          "interlock-probe-shm",
        ],
        cwd: "/worktree",
        environment: { VALUE: "one" },
      }),
    );
  });

  it("refuses an exec template that drops an access argument before running anything", async () => {
    const processRuns: string[][] = [];
    const results = await runProbeChecks({
      runtime: runtime({ before: ["fixture-agent"], after: [] }),
      launch,
      processRunner: async (invocation) => {
        processRuns.push([...invocation.argv]);
        return { code: 0, output: "" };
      },
    });

    expect(results.every((result) => result.state === "unavailable")).toBe(true);
    expect(
      results.every((result) => result.state === "unavailable" && result.reason.includes("--safe")),
    ).toBe(true);
    expect(processRuns).toEqual([]);
  });

  it("reports an adapter without a probe executor as unavailable for every check", async () => {
    const results = await runProbeChecks({ runtime: runtime(undefined), launch });

    expect(results).toHaveLength(5);
    expect(results.every((result) => result.state === "unavailable")).toBe(true);
    expect(results[0]).toEqual({
      check: "shm",
      state: "unavailable",
      reason: 'runtime adapter for kind "fixture-agent" has no probe executor',
    });
  });

  it("does not run a process when the exec program differs", async () => {
    const processRuns: string[][] = [];
    const result = execProbeInvocation(
      runtime({ before: ["host-shell", "--safe"], after: [] }),
      launch,
      "loopback",
    );

    if (!isErr(result)) return;
    expect(result.error).toContain("fixture-agent");
    expect(processRuns).toEqual([]);
  });
});
