import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import { unwrap } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureGit } from "../../../test/support/gitFixture.ts";
import {
  commitBriefIfChanged,
  createDetachedWorktree,
  ensureNodeWorktree,
  removeWorktree,
  worktreeGitLayout,
} from "../src/worktree.ts";
import { gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";

// The supported boundary this file proves, on the installed Git: auto-maintenance launched by
// the runner's own `git commit` (commitBriefIfChanged, in a retained node worktree) runs
// reflog-expire before it detaches, and after detaching writes only into the common object
// store. Nothing it runs after the detach point writes into any worktree directory or any
// worktree's administrative directory, so no detached writer can reach the backfill worktree
// that removeWorktree deletes. rerere-gc is the one detached task that can write an admin
// directory, the launching worktree's own MERGE_RR.lock, and only when rerere is enabled.
//
// Every fixture here re-enables maintenance.auto (fixture repositories pin it off), pins
// maintenance.autoDetach=false so maintenance finishes before the command returns, and forces
// each task's auto condition with maintenance.<task>.auto=-1. Forcing changes when an enabled
// task is due, never which tasks are enabled, so the traced task set is Git's default one.
// Writes are observed by removing write permission from the directories under test: a task that
// creates or replaces any file there fails, which the positive controls show for the writers
// that do reach an admin directory.

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

const BRIEF = "brief.md";

let directory: string | undefined;
const lockedPaths: string[] = [];

afterEach(() => {
  for (const path of lockedPaths.splice(0)) setWritable(path, true);
  vi.unstubAllEnvs();
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

interface TraceEvent {
  readonly event: string;
  readonly category: string | undefined;
  readonly label: string | undefined;
  readonly argv: readonly string[] | undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toTraceEvent(value: unknown): TraceEvent {
  if (typeof value !== "object" || value === null || !("event" in value)) {
    throw new Error(`not a trace2 event: ${JSON.stringify(value)}`);
  }
  const argv =
    "argv" in value &&
    Array.isArray(value.argv) &&
    value.argv.every((arg): arg is string => typeof arg === "string")
      ? value.argv
      : undefined;
  return {
    event: String(value.event),
    category: "category" in value ? optionalString(value.category) : undefined,
    label: "label" in value ? optionalString(value.label) : undefined,
    argv,
  };
}

function traceEvents(path: string): readonly TraceEvent[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => toTraceEvent(JSON.parse(line)));
}

function tasksIn(events: readonly TraceEvent[], category: string): readonly string[] {
  return events
    .filter((event) => event.event === "region_enter" && event.category === category)
    .map((event) => event.label ?? "");
}

function childArgvs(events: readonly TraceEvent[]): readonly (readonly string[])[] {
  return events.filter((event) => event.event === "child_start").map((event) => event.argv ?? []);
}

function traced<T>(
  tracePath: string,
  run: () => T,
): { readonly value: T; readonly events: readonly TraceEvent[] } {
  vi.stubEnv("GIT_TRACE2_EVENT", tracePath);
  try {
    return { value: run(), events: traceEvents(tracePath) };
  } finally {
    vi.unstubAllEnvs();
  }
}

function setWritable(path: string, writable: boolean): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return;
  const mode = stat.mode & 0o777;
  chmodSync(path, writable ? mode | 0o200 : mode & ~0o222);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) setWritable(join(path, entry), writable);
  }
}

function lock(...paths: readonly string[]): void {
  for (const path of paths) {
    setWritable(path, false);
    lockedPaths.push(path);
  }
}

function unlock(...paths: readonly string[]): void {
  for (const path of paths) {
    setWritable(path, true);
    lockedPaths.splice(lockedPaths.indexOf(path), 1);
  }
}

function adminDirectory(worktree: string, commonGitDir: string): string {
  const layout = unwrap(worktreeGitLayout(worktree));
  if (layout.kind !== "linked") throw new Error(`${worktree} is not a linked worktree`);
  expect(layout.commonGitDir).toBe(commonGitDir);
  return layout.gitDir;
}

function packsIn(commonGitDir: string): readonly string[] {
  return readdirSync(join(commonGitDir, "objects", "pack"))
    .filter((name) => name.endsWith(".pack"))
    .sort();
}

function writeLooseObjects(cwd: string, count: number, tag: string): void {
  for (let index = 0; index < count; index++) {
    fixtureGit(["hash-object", "-w", "--stdin"], { cwd, input: `${tag} ${index}\n` });
  }
}

interface MaintenanceFixture {
  readonly root: string;
  readonly repo: string;
  readonly commonGitDir: string;
  readonly sha: string;
  readonly node: string;
  readonly nodeAdmin: string;
}

function maintenanceFixture(): MaintenanceFixture {
  const root = mkdtempSync(join(runsRoot, "worktree-maintenance-"));
  directory = root;
  const repo = join(root, "repo");
  mkdirSync(repo);
  writeFileSync(join(repo, "root.txt"), "root\n");
  writeFileSync(join(repo, ".gitignore"), ".worktrees/\n");
  gitInitFixtureWithContent(repo);
  const settings: readonly (readonly [string, string])[] = [
    ["maintenance.auto", "true"],
    ["maintenance.autoDetach", "false"],
    ["commit.gpgsign", "false"],
    ["user.name", "fixture"],
    ["user.email", "fixture@example.invalid"],
    ...KNOWN_TASKS.map((task): readonly [string, string] => [`maintenance.${task}.auto`, "-1"]),
  ];
  for (const [key, value] of settings) fixtureGit(["config", key, value], { cwd: repo });

  const sha = headSha(repo);
  const node = join(repo, ".worktrees", "node");
  unwrap(ensureNodeWorktree(repo, node, sha, "graph/demo/node"));
  const commonGitDir = realpathSync(join(repo, ".git"));
  return { root, repo, commonGitDir, sha, node, nodeAdmin: adminDirectory(node, commonGitDir) };
}

interface BriefCommit {
  readonly events: readonly TraceEvent[];
  readonly beforeDetach: readonly string[];
  readonly afterDetach: readonly string[];
}

function commitBrief(fixture: MaintenanceFixture): BriefCommit {
  writeFileSync(join(fixture.node, BRIEF), "the session brief\n");
  const { value, events } = traced(join(fixture.root, "brief-commit.trace"), () =>
    commitBriefIfChanged(fixture.node, BRIEF, "node", "session-1"),
  );
  expect(unwrap(value)).toBeDefined();
  return {
    events,
    beforeDetach: tasksIn(events, "maintenance foreground"),
    afterDetach: tasksIn(events, "maintenance"),
  };
}

function backfillWorktree(fixture: MaintenanceFixture): {
  readonly path: string;
  readonly admin: string;
} {
  const path = join(fixture.repo, ".worktrees", "backfill-proof");
  unwrap(createDetachedWorktree(fixture.repo, path, fixture.sha));
  return { path, admin: adminDirectory(path, fixture.commonGitDir) };
}

describe("the runner's worktrees against Git's default auto-maintenance", () => {
  it("resolves each linked worktree's admin directory inside the common directory and apart from its worktree", () => {
    const fixture = maintenanceFixture();
    console.log(`worktree maintenance boundary on ${fixtureGit(["--version"]).trim()}`);
    const backfill = backfillWorktree(fixture);

    expect(fixture.nodeAdmin).toBe(join(fixture.commonGitDir, "worktrees", "node"));
    expect(backfill.admin).toBe(join(fixture.commonGitDir, "worktrees", "backfill-proof"));
    for (const worktree of [fixture.node, backfill.path]) {
      expect(relative(fixture.commonGitDir, realpathSync(worktree)).startsWith("..")).toBe(true);
    }
  });

  it("runs the default task set from the runner's brief commit, reflog-expire before the detach point and the rest after it", () => {
    const fixture = maintenanceFixture();
    const packsBefore = packsIn(fixture.commonGitDir);

    const commit = commitBrief(fixture);

    const maintenance = childArgvs(commit.events).filter(
      (argv) => argv[1] === "maintenance" && argv[2] === "run",
    );
    expect(maintenance).toHaveLength(1);
    expect(maintenance[0]).toEqual(expect.arrayContaining(["--auto", "--no-detach"]));
    expect(commit.beforeDetach).toEqual(["reflog-expire"]);
    expect(commit.afterDetach).toEqual([
      "geometric-repack",
      "commit-graph",
      "worktree-prune",
      "rerere-gc",
    ]);
    expect(packsIn(fixture.commonGitDir)).not.toEqual(packsBefore);
  });

  it("writes the detached tasks only into the common object store, never into a node or backfill worktree or admin directory", () => {
    const fixture = maintenanceFixture();
    const { afterDetach } = commitBrief(fixture);
    const backfill = backfillWorktree(fixture);
    writeLooseObjects(fixture.node, 64, "after the brief commit");
    const packsBefore = packsIn(fixture.commonGitDir);

    lock(fixture.node, fixture.nodeAdmin, backfill.path, backfill.admin);
    fixtureGit(
      ["maintenance", "run", "--no-detach", ...afterDetach.map((task) => `--task=${task}`)],
      { cwd: fixture.node },
    );
    unlock(fixture.node, fixture.nodeAdmin, backfill.path, backfill.admin);

    expect(afterDetach).not.toEqual([]);
    expect(packsIn(fixture.commonGitDir)).not.toEqual(packsBefore);
    expect(readdirSync(join(fixture.commonGitDir, "objects", "info", "commit-graphs"))).not.toEqual(
      [],
    );
  });

  it("catches, under the same lock-down, the foreground reflog-expire writing a sibling backfill worktree's admin directory", () => {
    const fixture = maintenanceFixture();
    const { beforeDetach } = commitBrief(fixture);
    const backfill = backfillWorktree(fixture);

    lock(backfill.admin);

    expect(beforeDetach).toContain("reflog-expire");
    expect(() =>
      fixtureGit(["maintenance", "run", "--no-detach", "--task=reflog-expire"], {
        cwd: fixture.node,
      }),
    ).toThrow(join(backfill.admin, "HEAD.lock"));
  });

  it("catches rerere-gc, once rerere is enabled, writing only the launching node worktree's own admin directory", () => {
    const fixture = maintenanceFixture();
    const backfill = backfillWorktree(fixture);
    const rerereGc = [
      "-c",
      "rerere.enabled=true",
      "maintenance",
      "run",
      "--no-detach",
      "--task=rerere-gc",
    ];

    lock(backfill.path, backfill.admin);
    fixtureGit(rerereGc, { cwd: fixture.node });
    lock(fixture.nodeAdmin);

    expect(() => fixtureGit(rerereGc, { cwd: fixture.node })).toThrow(
      join(fixture.nodeAdmin, "MERGE_RR.lock"),
    );
  });

  it("launches no maintenance anywhere in the backfill worktree's own lifecycle", () => {
    const fixture = maintenanceFixture();
    const path = join(fixture.repo, ".worktrees", "backfill-proof");

    const created = traced(join(fixture.root, "backfill-create.trace"), () =>
      createDetachedWorktree(fixture.repo, path, fixture.sha),
    );
    const admin = adminDirectory(path, fixture.commonGitDir);
    const removed = traced(join(fixture.root, "backfill-remove.trace"), () =>
      removeWorktree(fixture.repo, path),
    );

    unwrap(created.value);
    unwrap(removed.value);
    const launched = [...childArgvs(created.events), ...childArgvs(removed.events)];
    expect(created.events).not.toEqual([]);
    expect(removed.events).not.toEqual([]);
    expect(launched.filter((argv) => argv.includes("maintenance"))).toEqual([]);
    expect(existsSync(path)).toBe(false);
    expect(existsSync(admin)).toBe(false);
  });
});
