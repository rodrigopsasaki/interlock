import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err, ok } from "@phyxiusjs/fp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Runtime, RuntimeRefusal } from "../src/runtime.ts";
import {
  driveOnce,
  fixtureRepository,
  isolateGitForThisProcess,
  legacyLocalYaml,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, "refusal-outcomes-")));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

async function fixture(setup: readonly string[] = []) {
  if (directory === undefined) throw new Error("expected a run directory");
  const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: fake"], setup));
  const cataloguePath = join(directory, "runtimes.yaml");
  writeFileSync(
    cataloguePath,
    [
      "interlock: runtimes@v0",
      "runtimes:",
      "  fixture:",
      "    kind: fake",
      "    model: fixture-model",
      "    commits: runner",
      "",
    ].join("\n"),
  );
  const selected = await selectedRuntime(repoRoot, cataloguePath, "fixture");
  return { repoRoot, ...selected };
}

function outcomeEvents(record: Awaited<ReturnType<typeof driveOnce>>) {
  return record.events.filter((event) => event.kind === "outcome-set");
}

describe("refusals stay resettable", () => {
  it("preflights the server before creating a worktree or ledger event", async () => {
    const { repoRoot, localConfig, agentRuntime } = await fixture();
    const recording = recordingRuntime();
    const refusal: RuntimeRefusal = {
      kind: "not-ready",
      message: "herdr's server is not running; open herdr and run again",
    };
    const runtime: Runtime = {
      ...recording.runtime,
      checkServer: () => Promise.resolve(err(refusal)),
    };

    const result = await driveOnce(repoRoot, "n", localConfig, agentRuntime, runtime);

    expect(result.outcome).toEqual({
      exitCode: 1,
      message: "herdr's server is not running; open herdr and run again",
    });
    expect(recording.paneOpens).toEqual([]);
    expect(result.events).toEqual([]);
  });

  it("abandons a worktree setup refusal without an outcome", async () => {
    const { repoRoot, localConfig, agentRuntime } = await fixture(["false"]);
    const result = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      agentRuntime,
      recordingRuntime().runtime,
    );

    expect(result.outcome.exitCode).toBe(1);
    expect(result.outcome.message).toContain("worktree setup refused");
    expect(outcomeEvents(result)).toEqual([]);
  });

  it("abandons an agent start refusal without an outcome", async () => {
    const refusal: RuntimeRefusal = { kind: "transport", because: "fixture agent refused" };
    const recording = recordingRuntime(() => err(refusal));
    const { repoRoot, localConfig, agentRuntime } = await fixture();
    const result = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recording.runtime);

    expect(result.outcome.exitCode).toBe(1);
    expect(result.outcome.message).toContain("agent start refused");
    expect(outcomeEvents(result)).toEqual([]);
  });

  it("abandons a wait timeout with no judged work and no outcome", async () => {
    const recording = recordingRuntime();
    const refusal: RuntimeRefusal = {
      kind: "timeout",
      until: ["idle"],
      timeoutMs: 1,
      status: "working",
    };
    let waits = 0;
    const runtime: Runtime = {
      ...recording.runtime,
      reportIdentity: () => Promise.resolve(ok(undefined)),
      waitUntil: () => {
        waits += 1;
        return waits <= 2 ? Promise.resolve(ok("idle")) : Promise.resolve(err(refusal));
      },
    };
    const { repoRoot, localConfig, agentRuntime } = await fixture();
    const result = await driveOnce(repoRoot, "n", localConfig, agentRuntime, runtime);

    expect(result.outcome.exitCode).toBe(1);
    expect(result.outcome.message).toContain("wait refused");
    expect(outcomeEvents(result)).toEqual([]);
    expect(result.events.some((event) => event.kind === "session-started")).toBe(true);
  });
});
