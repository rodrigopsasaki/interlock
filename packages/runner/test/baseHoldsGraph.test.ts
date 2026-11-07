import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import type { LedgerEvent } from "ledger";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import {
  driveOnce,
  fixtureRepository,
  isolateGitForThisProcess,
  legacyLocalYaml,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";
import { commitAll, headSha } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, "base-holds-graph-")));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function repositoryWithGraph(): {
  readonly repoRoot: string;
  readonly oldBase: string;
  readonly mainHead: string;
} {
  if (directory === undefined) throw new Error("expected a run directory");
  const repoRoot = fixtureRepository(directory, legacyLocalYaml(["kind: fake", "args: []"]), false);
  const oldBase = headSha(repoRoot);
  mkdirSync(join(repoRoot, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(repoRoot, ".interlock", "graphs", "g.yaml"), "graph fixture\n");
  commitAll(repoRoot, "add graph fixture");
  return { repoRoot, oldBase, mainHead: headSha(repoRoot) };
}

async function selectedFixtureRuntime(
  repoRoot: string,
): Promise<Awaited<ReturnType<typeof selectedRuntime>>> {
  if (directory === undefined) throw new Error("expected a run directory");
  const cataloguePath = join(directory, "runtimes.yaml");
  writeFileSync(
    cataloguePath,
    ["interlock: runtimes@v0", "runtimes:", "  plain:", "    kind: fake", "    model: m", ""].join(
      "\n",
    ),
  );
  return selectedRuntime(repoRoot, cataloguePath, "plain");
}

function startedEvent(
  events: readonly LedgerEvent[],
): Extract<LedgerEvent, { kind: "session-started" }> {
  const started = events.find(
    (event): event is Extract<LedgerEvent, { kind: "session-started" }> =>
      event.kind === "session-started",
  );
  if (started === undefined) throw new Error("expected a session-started event");
  return started;
}

describe("base-holds-graph launch preflight", () => {
  it("refuses a kept worktree whose merge-base predates the graph without recording or launching", async () => {
    const { repoRoot, oldBase, mainHead } = repositoryWithGraph();
    const worktreePath = join(repoRoot, ".worktrees", "n");
    fixtureGit(["worktree", "add", "-b", "graph/g/n", worktreePath, oldBase], { cwd: repoRoot });
    writeFileSync(join(worktreePath, "prior-work.txt"), "prior session work\n");
    commitAll(worktreePath, "preserve prior session work");
    const keptHead = headSha(worktreePath);
    const { localConfig, agentRuntime } = await selectedFixtureRuntime(repoRoot);
    const recording = recordingRuntime();

    const result = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      agentRuntime,
      recording.runtime,
      createControlledClock(),
    );

    expect(result.outcome).toEqual({
      exitCode: 1,
      message: `this worktree's base (${oldBase.slice(0, 7)}) predates graph g; merge main into graph/g/n and run again`,
    });
    expect(headSha(worktreePath)).toBe(keptHead);
    expect(headSha(repoRoot)).toBe(mainHead);
    expect(recording.paneOpens).toEqual([]);
    expect(recording.starts).toEqual([]);
    expect(result.events).toEqual([]);
    expect(existsSync(join(repoRoot, ".interlock", "sessions", "g", "n", "brief.md"))).toBe(false);
  });

  it("proceeds after main is merged into the kept worktree and pins the holding base", async () => {
    const { repoRoot, oldBase, mainHead } = repositoryWithGraph();
    const worktreePath = join(repoRoot, ".worktrees", "n");
    fixtureGit(["worktree", "add", "-b", "graph/g/n", worktreePath, oldBase], { cwd: repoRoot });
    writeFileSync(join(worktreePath, "prior-work.txt"), "prior session work\n");
    commitAll(worktreePath, "preserve prior session work");
    fixtureGit(["merge", "--no-ff", "main", "-m", "merge main into the node branch"], {
      cwd: worktreePath,
    });
    const { localConfig, agentRuntime } = await selectedFixtureRuntime(repoRoot);
    const recording = recordingRuntime();

    const result = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      agentRuntime,
      recording.runtime,
      createControlledClock(),
    );

    expect(result.outcome.exitCode).toBe(1);
    expect(recording.paneOpens).toEqual([worktreePath]);
    expect(recording.starts).toHaveLength(1);
    expect(startedEvent(result.events).graphBaseSha).toBe(mainHead);
  });

  it("proceeds on a fresh worktree cut from a main that holds the graph", async () => {
    const { repoRoot, mainHead } = repositoryWithGraph();
    const { localConfig, agentRuntime } = await selectedFixtureRuntime(repoRoot);
    const recording = recordingRuntime();

    const result = await driveOnce(
      repoRoot,
      "n",
      localConfig,
      agentRuntime,
      recording.runtime,
      createControlledClock(),
    );

    expect(result.outcome.exitCode).toBe(1);
    expect(recording.paneOpens).toHaveLength(1);
    expect(recording.starts).toHaveLength(1);
    expect(startedEvent(result.events).graphBaseSha).toBe(mainHead);
  });
});
