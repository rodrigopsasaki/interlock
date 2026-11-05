import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import type { GraphDocument } from "face";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import { backfillGraph } from "../src/backfill.ts";
import { commitBriefIfChanged } from "../src/worktree.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const KNOWN_TASKS = [
  "gc",
  "commit-graph",
  "prefetch",
  "loose-objects",
  "incremental-repack",
  "geometric-repack",
  "pack-refs",
  "reflog-expire",
  "rerere-gc",
  "worktree-prune",
] as const;

let directory: string | undefined;

afterEach(() => {
  vi.unstubAllEnvs();
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function maintenanceEnabledRepo(): string {
  directory = mkdtempSync(join(runsRoot, "backfill-maintenance-"));
  writeFileSync(
    join(directory, "package.json"),
    JSON.stringify({ name: "fixture", private: true }),
  );
  const session = join(directory, ".interlock", "sessions", "fixture-graph", "node-a");
  mkdirSync(session, { recursive: true });
  writeFileSync(join(session, "debrief.yaml"), "interlock: debrief@v1\n");
  gitInitFixtureWithContent(directory);
  const settings: readonly (readonly [string, string])[] = [
    ["maintenance.auto", "true"],
    ["maintenance.autoDetach", "false"],
    ["commit.gpgsign", "false"],
    ["user.name", "fixture"],
    ["user.email", "fixture@example.invalid"],
    ...KNOWN_TASKS.map((task): readonly [string, string] => [`maintenance.${task}.auto`, "-1"]),
  ];
  for (const [key, value] of settings) fixtureGit(["config", key, value], { cwd: directory });
  return directory;
}

function maintenanceRuns(tracePath: string): number {
  return readFileSync(tracePath, "utf-8")
    .split("\n")
    .filter((line) => line.includes('"child_start"') && line.includes('"maintenance"')).length;
}

const BRIEF = "brief.md";

describe("auto maintenance kept out of the writers that race a backfill worktree's removal", () => {
  it("runs none from a brief commit, and shows a backfill command maintenance.auto=false on top of an inherited GIT_CONFIG_COUNT", async () => {
    const repo = maintenanceEnabledRepo();
    const briefTrace = join(repo, "brief.trace");
    writeFileSync(join(repo, BRIEF), "the session brief\n");
    vi.stubEnv("GIT_TRACE2_EVENT", briefTrace);
    unwrap(commitBriefIfChanged(repo, BRIEF, "node-a", "session-1"));
    vi.unstubAllEnvs();
    expect(maintenanceRuns(briefTrace)).toBe(0);

    expect(
      fixtureGit(["config", "--file", join(repo, ".git", "config"), "--get", "maintenance.auto"]),
    ).toBe("true\n");
    vi.stubEnv("GIT_CONFIG_COUNT", "1");
    vi.stubEnv("GIT_CONFIG_KEY_0", "user.name");
    vi.stubEnv("GIT_CONFIG_VALUE_0", "inherited");
    const document: GraphDocument = {
      id: "fixture-graph",
      gates: [],
      nodes: [
        {
          id: "node-a",
          dependsOn: [],
          gates: [
            {
              id: "sees-config",
              kind: "command",
              run: "git config --get-regexp ^(maintenance\\.auto|user\\.name)$",
              expectOutput: /^(?=[\s\S]*maintenance\.auto false)(?=[\s\S]*user\.name inherited)/,
            },
          ],
        },
      ],
    };

    const backfilled = unwrap(
      await backfillGraph({
        repoRoot: repo,
        mainBranch: "main",
        document,
        ledger: memoryLedger(),
        clock: createControlledClock(),
        standingGates: [],
        worktreeRoot: ".worktrees",
      }),
    );

    expect(backfilled.map((entry) => entry.outcome.kind)).toEqual(["cleared"]);
  }, 30_000);
});
