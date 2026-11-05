import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { err } from "@phyxiusjs/fp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CORRUPT_GIT_FILE_SCRIPT,
  cloneAsNonLinkedWorktree,
  driveOnce,
  fixtureRepository,
  isolateGitForThisProcess,
  legacyLocalYaml,
  narratedArgv,
  recordingRuntime,
  selectedRuntime,
} from "./support/driveFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let restoreGit: (() => void) | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  directory = realpathSync(mkdtempSync(join(runsRoot, "writable-root-launch-")));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function runDirectory(): string {
  if (directory === undefined) throw new Error("no run directory");
  return directory;
}

const PLAIN_LEGACY = legacyLocalYaml(["kind: fake", "args: [--legacy]"]);

function catalogue(entries: readonly string[]): string {
  const path = join(runDirectory(), "runtimes.yaml");
  writeFileSync(path, ["interlock: runtimes@v0", "runtimes:", ...entries, ""].join("\n"));
  return path;
}

const SANDBOXED_ENTRY = [
  "  sandboxed:",
  "    kind: fake",
  "    args: [--sandboxed, --mode, workspace]",
  "    model: m",
  '    writable_root_args: [--test-write-root, "{path}"]',
];

const PLAIN_ENTRY = ["  plain:", "    kind: fake", "    args: [--plain]", "    model: m"];

describe("driveInteractiveSession: writable_root_args", () => {
  it("appends the expanded catalogue template for a linked worktree and narrates the root and argv", async () => {
    const repoRoot = fixtureRepository(runDirectory(), PLAIN_LEGACY);
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    const commonGitDir = join(repoRoot, ".git");
    const expected = ["--sandboxed", "--mode", "workspace", "--test-write-root", commonGitDir];
    expect(recorded.starts).toEqual([
      { cwd: join(repoRoot, ".worktrees", "n"), kind: "fake", args: expected },
    ]);
    expect(drive.narrated).toContain(`writable root ${commonGitDir} supplied to runtime sandboxed`);
    expect(narratedArgv(drive.narrated)).toEqual([recorded.starts[0]?.args]);
    expect(agentRuntime.args).toEqual(["--sandboxed", "--mode", "workspace"]);
  });

  it("appends the expanded legacy local.yaml template through merge and default selection", async () => {
    const repoRoot = fixtureRepository(
      runDirectory(),
      legacyLocalYaml([
        "kind: fake",
        "args: [--legacy]",
        'writable_root_args: ["{path}", --after]',
      ]),
    );
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(PLAIN_ENTRY),
      undefined,
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    const commonGitDir = join(repoRoot, ".git");
    expect(agentRuntime.source).toBe("local.yaml");
    expect(recorded.starts.map((start) => start.args)).toEqual([
      ["--legacy", commonGitDir, "--after"],
    ]);
    expect(drive.narrated).toContain(`writable root ${commonGitDir} supplied to runtime default`);
    expect(narratedArgv(drive.narrated)).toEqual([recorded.starts[0]?.args]);
  });

  it.each([
    ["a catalogue entry", PLAIN_LEGACY, "plain", ["--plain"]],
    ["the legacy local.yaml block", PLAIN_LEGACY, undefined, ["--legacy"]],
  ])("keeps %s's argv unchanged without the field", async (_name, local, name, args) => {
    const repoRoot = fixtureRepository(runDirectory(), local);
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(PLAIN_ENTRY),
      name,
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    expect(recorded.starts.map((start) => start.args)).toEqual([args]);
    expect(drive.narrated.some((line) => line.startsWith("writable root "))).toBe(false);
    expect(narratedArgv(drive.narrated)).toEqual([args]);
  });

  it.each([
    ["a catalogue entry", PLAIN_LEGACY, "sandboxed", ["--sandboxed", "--mode", "workspace"]],
    [
      "the legacy local.yaml block",
      legacyLocalYaml(["kind: fake", "args: [--legacy]", 'writable_root_args: ["{path}"]']),
      undefined,
      ["--legacy"],
    ],
  ])("keeps %s's argv unchanged for a non-linked worktree", async (_name, local, name, args) => {
    const repoRoot = fixtureRepository(runDirectory(), local);
    cloneAsNonLinkedWorktree(repoRoot, "n");
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      name,
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    expect(agentRuntime.writableRootArgs).toBeDefined();
    expect(recorded.starts.map((start) => start.args)).toEqual([args]);
    expect(drive.narrated.some((line) => line.startsWith("writable root "))).toBe(false);
    expect(narratedArgv(drive.narrated)).toEqual([args]);
  });

  it("refuses readably before any pane or start when the common git dir cannot be resolved", async () => {
    const repoRoot = fixtureRepository(
      runDirectory(),
      legacyLocalYaml(["kind: fake", "args: []"], [`sh ${CORRUPT_GIT_FILE_SCRIPT}`]),
    );
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    expect(recorded.paneOpens).toEqual([]);
    expect(recorded.starts).toEqual([]);
    expect(drive.outcome.exitCode).toBe(1);
    expect(drive.outcome.message).toMatch(
      /^writable root refused: git rev-parse --path-format=absolute --git-dir: /,
    );
    expect(drive.narrated).toContain(drive.outcome.message);
    expect(narratedArgv(drive.narrated)).toEqual([]);
  });

  it("keeps each attempt's argv independent when two attempts share one frozen runtime entry", async () => {
    const first = fixtureRepository(runDirectory(), PLAIN_LEGACY);
    const second = fixtureRepository(runDirectory(), PLAIN_LEGACY);
    const { localConfig, agentRuntime } = await selectedRuntime(
      first,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const shared = Object.freeze({ ...agentRuntime, args: Object.freeze([...agentRuntime.args]) });
    const recorded = recordingRuntime();

    const firstDrive = await driveOnce(first, "n", localConfig, shared, recorded.runtime);
    const secondDrive = await driveOnce(second, "n", localConfig, shared, recorded.runtime);

    const base = ["--sandboxed", "--mode", "workspace", "--test-write-root"];
    expect(recorded.starts.map((start) => start.args)).toEqual([
      [...base, join(first, ".git")],
      [...base, join(second, ".git")],
    ]);
    expect(recorded.starts[0]?.args).not.toBe(recorded.starts[1]?.args);
    expect(narratedArgv(firstDrive.narrated)).toEqual([recorded.starts[0]?.args]);
    expect(narratedArgv(secondDrive.narrated)).toEqual([recorded.starts[1]?.args]);
    expect(shared.args).toEqual(["--sandboxed", "--mode", "workspace"]);
  });

  it("records no successful start when the runtime refuses the start", async () => {
    const repoRoot = fixtureRepository(runDirectory(), PLAIN_LEGACY);
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const recorded = recordingRuntime(() =>
      err({ kind: "transport", because: "agent CLI crashed" }),
    );

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    expect(recorded.starts).toHaveLength(1);
    expect(drive.outcome.message).toBe("agent start refused: agent CLI crashed");
    expect(drive.narrated.some((line) => / started \(/.test(line))).toBe(false);
    expect(narratedArgv(drive.narrated)).toEqual([]);
  });
});
