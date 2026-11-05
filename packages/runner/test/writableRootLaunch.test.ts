import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { err } from "@phyxiusjs/fp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeGitForwarder } from "../../../test/support/gitFixture.ts";
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
let restorePath: string | undefined;

beforeEach(() => {
  restoreGit = isolateGitForThisProcess();
  restorePath = process.env["PATH"];
  directory = realpathSync(mkdtempSync(join(runsRoot, "writable-root-launch-")));
});

afterEach(() => {
  restoreGit?.();
  restoreGit = undefined;
  process.env["PATH"] = restorePath;
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

// Puts a git first on PATH that refuses any invocation naming one of the given flags and hands
// every other invocation to the real git, so one rev-parse can fail while the rest still works.
function refuseGitFlags(flags: readonly string[]): void {
  const bin = join(runDirectory(), "bin");
  mkdirSync(bin);
  writeGitForwarder(join(bin, "git"), flags);
  process.env["PATH"] = `${bin}${delimiter}${process.env["PATH"] ?? ""}`;
}

function linkedGitDirs(repoRoot: string, node: string) {
  return {
    common: join(repoRoot, ".git"),
    perWorktree: join(repoRoot, ".git", "worktrees", node),
  };
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
  it("appends the catalogue template expanded for the common then the per-worktree git dir and narrates both", async () => {
    const repoRoot = fixtureRepository(runDirectory(), PLAIN_LEGACY);
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    const { common, perWorktree } = linkedGitDirs(repoRoot, "n");
    const expected = [
      "--sandboxed",
      "--mode",
      "workspace",
      "--test-write-root",
      common,
      "--test-write-root",
      perWorktree,
    ];
    expect(recorded.starts).toEqual([
      { cwd: join(repoRoot, ".worktrees", "n"), kind: "fake", args: expected },
    ]);
    expect(drive.narrated.filter((line) => line.startsWith("writable root "))).toEqual([
      `writable root ${common} supplied to runtime sandboxed`,
      `writable root ${perWorktree} supplied to runtime sandboxed`,
    ]);
    expect(narratedArgv(drive.narrated)).toEqual([recorded.starts[0]?.args]);
    expect(agentRuntime.args).toEqual(["--sandboxed", "--mode", "workspace"]);
  });

  it("appends the legacy local.yaml template twice through merge and default selection", async () => {
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

    const { common, perWorktree } = linkedGitDirs(repoRoot, "n");
    expect(agentRuntime.source).toBe("local.yaml");
    expect(recorded.starts.map((start) => start.args)).toEqual([
      ["--legacy", common, "--after", perWorktree, "--after"],
    ]);
    expect(drive.narrated.filter((line) => line.startsWith("writable root "))).toEqual([
      `writable root ${common} supplied to runtime default`,
      `writable root ${perWorktree} supplied to runtime default`,
    ]);
    expect(narratedArgv(drive.narrated)).toEqual([recorded.starts[0]?.args]);
  });

  it("hands each git dir as one whole argv element when its path holds spaces and quotes", async () => {
    const parent = join(runDirectory(), `with "double" and 'single' quotes`);
    mkdirSync(parent);
    const repoRoot = fixtureRepository(parent, PLAIN_LEGACY);
    const { localConfig, agentRuntime } = await selectedRuntime(
      repoRoot,
      catalogue(SANDBOXED_ENTRY),
      "sandboxed",
    );
    const recorded = recordingRuntime();

    const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

    const { common, perWorktree } = linkedGitDirs(repoRoot, "n");
    expect(common).toContain(`"double" and 'single' quotes/repo `);
    expect(recorded.starts.map((start) => start.args.slice(3))).toEqual([
      ["--test-write-root", common, "--test-write-root", perWorktree],
    ]);
    expect(narratedArgv(drive.narrated)).toEqual([recorded.starts[0]?.args]);
  });

  it.each([
    ["a catalogue entry", PLAIN_LEGACY, "plain", ["--plain"]],
    ["the legacy local.yaml block", PLAIN_LEGACY, undefined, ["--legacy"]],
  ])(
    "keeps %s's argv unchanged and resolves no git dir without the field",
    async (_name, local, name, args) => {
      const repoRoot = fixtureRepository(runDirectory(), local);
      refuseGitFlags(["--git-dir", "--git-common-dir"]);
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
    },
  );

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

  it("refuses readably before any pane or start when a broken .git file stops resolution", async () => {
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

  it.each([
    ["the per-worktree git dir", "--git-dir"],
    ["the common git dir", "--git-common-dir"],
  ])(
    "refuses readably before any pane or start when %s alone cannot be resolved",
    async (_name, flag) => {
      const repoRoot = fixtureRepository(runDirectory(), PLAIN_LEGACY);
      const { localConfig, agentRuntime } = await selectedRuntime(
        repoRoot,
        catalogue(SANDBOXED_ENTRY),
        "sandboxed",
      );
      refuseGitFlags([flag]);
      const recorded = recordingRuntime();

      const drive = await driveOnce(repoRoot, "n", localConfig, agentRuntime, recorded.runtime);

      expect(recorded.paneOpens).toEqual([]);
      expect(recorded.starts).toEqual([]);
      expect(drive.outcome.exitCode).toBe(1);
      expect(drive.outcome.message).toMatch(
        new RegExp(`^writable root refused: git rev-parse --path-format=absolute ${flag}: `),
      );
      expect(drive.outcome.message).toContain(`fixture git refuses ${flag}`);
      expect(drive.narrated).toContain(drive.outcome.message);
      expect(drive.narrated.some((line) => line.endsWith("supplied to runtime sandboxed"))).toBe(
        false,
      );
      expect(narratedArgv(drive.narrated)).toEqual([]);
    },
  );

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

    const expanded = (repoRoot: string) => {
      const { common, perWorktree } = linkedGitDirs(repoRoot, "n");
      return ["--test-write-root", common, "--test-write-root", perWorktree];
    };
    const base = ["--sandboxed", "--mode", "workspace"];
    expect(recorded.starts.map((start) => start.args)).toEqual([
      [...base, ...expanded(first)],
      [...base, ...expanded(second)],
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
