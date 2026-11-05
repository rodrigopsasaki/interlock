import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Clock, createControlledClock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { LedgerEvent } from "ledger";
import { noneClient } from "substrate";
import { cloneFixtureRepository, fixtureGit } from "../../../../test/support/gitFixture.ts";
import { type LocalConfig, loadLocalConfig } from "../../src/localConfig.ts";
import type { Agent, Pane, Runtime, RuntimeRefusal } from "../../src/runtime.ts";
import {
  loadRuntimeCatalogue,
  mergeRuntimes,
  type ResolvedRuntime,
} from "../../src/runtimeCatalogue.ts";
import { selectRuntime } from "../../src/runtimeSelection.ts";
import { type DriveSessionOutcome, driveInteractiveSession } from "../../src/sessionDrive.ts";
import { gitInitFixtureWithContent } from "./gitFixture.ts";
import { memoryLedgerWithLog } from "./memoryLedger.ts";

// Git state a fixture must not inherit from the machine or from a parent repository's hooks.
const INHERITED_GIT_VARIABLES = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_COMMON_DIR",
  "GIT_OBJECT_DIRECTORY",
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CEILING_DIRECTORIES",
  "GIT_NAMESPACE",
  "GIT_PREFIX",
];

export const ISOLATED_GIT_ENV: Readonly<Record<string, string>> = {
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
};

export function isolatedGitEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...ISOLATED_GIT_ENV };
  for (const name of INHERITED_GIT_VARIABLES) delete environment[name];
  return environment;
}

export function isolateGitForThisProcess(): () => void {
  const saved = new Map<string, string | undefined>();
  const names = [...INHERITED_GIT_VARIABLES, ...Object.keys(ISOLATED_GIT_ENV)];
  for (const name of names) saved.set(name, process.env[name]);
  for (const name of INHERITED_GIT_VARIABLES) delete process.env[name];
  for (const [name, value] of Object.entries(ISOLATED_GIT_ENV)) process.env[name] = value;
  return () => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

export const CORRUPT_GIT_FILE_SCRIPT = "corrupt-git-file.sh";

export function legacyLocalYaml(runtimeLines: readonly string[], setup: readonly string[] = []) {
  return [
    "interlock: local@v0",
    "runtime:",
    ...runtimeLines.map((line) => `  ${line}`),
    "worktree_root: .worktrees",
    ...(setup.length === 0 ? [] : ["worktree_setup:", ...setup.map((line) => `  - "${line}"`)]),
    "lease_ms: 900000",
    "run_timeout_ms: 3600000",
    "substrate:",
    "  address: none",
    "",
  ].join("\n");
}

// A canonical (symlink-free) repository with one commit, a local.yaml, and a script a worktree
// setup step can run to break the worktree's .git file after the brief and before the launch.
export function fixtureRepository(parent: string, localYaml: string): string {
  const repoRoot = realpathSync(mkdtempSync(join(parent, "repo ")));
  writeFileSync(join(repoRoot, "README.md"), "fixture\n");
  writeFileSync(
    join(repoRoot, CORRUPT_GIT_FILE_SCRIPT),
    "printf 'gitdir: /nonexistent/common-git-writable\\n' > .git\n",
  );
  mkdirSync(join(repoRoot, ".interlock"), { recursive: true });
  writeFileSync(join(repoRoot, ".interlock", "local.yaml"), localYaml);
  gitInitFixtureWithContent(repoRoot);
  return repoRoot;
}

export function cloneAsNonLinkedWorktree(repoRoot: string, node: string): string {
  const path = join(repoRoot, ".worktrees", node);
  fixtureGit(["branch", `graph/g/${node}`], { cwd: repoRoot });
  cloneFixtureRepository(repoRoot, path, ["--quiet"]);
  return path;
}

export async function selectedRuntime(
  repoRoot: string,
  cataloguePath: string,
  name: string | undefined,
): Promise<{ readonly localConfig: LocalConfig; readonly agentRuntime: ResolvedRuntime }> {
  const local = await loadLocalConfig(repoRoot);
  if (isErr(local)) throw new Error(`fixture local.yaml refused: ${JSON.stringify(local.error)}`);
  const catalogue = await loadRuntimeCatalogue(cataloguePath);
  if (isErr(catalogue)) {
    throw new Error(`fixture catalogue refused: ${JSON.stringify(catalogue.error)}`);
  }
  const merged = mergeRuntimes(catalogue.value, local.value);
  if (isErr(merged)) throw new Error(`fixture merge refused: ${JSON.stringify(merged.error)}`);
  const selected = selectRuntime(merged.value, name);
  if (isErr(selected)) {
    throw new Error(`fixture selection refused: ${JSON.stringify(selected.error)}`);
  }
  return { localConfig: local.value, agentRuntime: selected.value };
}

export interface RecordedStart {
  readonly cwd: string;
  readonly kind: string;
  readonly args: readonly string[];
}

export interface RecordingRuntime {
  readonly runtime: Runtime;
  readonly paneOpens: string[];
  readonly starts: RecordedStart[];
}

const STOPPED_AFTER_START: RuntimeRefusal = {
  kind: "transport",
  because: "the fixture stops the drive after the agent starts",
};

// Records every pane and start, then ends the drive at the identity report, which runs only
// after a successful start, so nothing past the launch needs faking.
export function recordingRuntime(
  onStart: (start: RecordedStart) => Result<void, RuntimeRefusal> = () => ok(undefined),
): RecordingRuntime {
  const paneOpens: string[] = [];
  const starts: RecordedStart[] = [];
  const paneCwds = new Map<string, string>();
  const runtime: Runtime = {
    openPane(cwd) {
      paneOpens.push(cwd);
      const pane: Pane = { id: `pane-${paneOpens.length}` };
      paneCwds.set(pane.id, cwd);
      return Promise.resolve(ok(pane));
    },
    startAgent(pane, kind, args) {
      const start = { cwd: paneCwds.get(pane.id) ?? "", kind, args: [...args] };
      starts.push(start);
      const started = onStart(start);
      if (isErr(started)) return Promise.resolve(started);
      const agent: Agent = { id: `agent-${starts.length}`, pane };
      return Promise.resolve(ok(agent));
    },
    reportIdentity: () => Promise.resolve(err(STOPPED_AFTER_START)),
    prompt: () => Promise.resolve(ok(undefined)),
    waitUntil: () => Promise.resolve(ok("idle")),
    read: () => Promise.resolve(ok("")),
    sendKeys: () => Promise.resolve(ok(undefined)),
    sendPaneKeys: () => Promise.resolve(ok(undefined)),
    closePane: () => Promise.resolve(ok(undefined)),
  };
  return { runtime, paneOpens, starts };
}

export interface DriveRecord {
  readonly outcome: DriveSessionOutcome;
  readonly narrated: readonly string[];
  readonly events: readonly LedgerEvent[];
}

export async function driveOnce(
  repoRoot: string,
  node: string,
  localConfig: LocalConfig,
  agentRuntime: ResolvedRuntime,
  runtime: Runtime,
  clock: Clock = createControlledClock({ initialTime: 0 }),
): Promise<DriveRecord> {
  const { ledger, events } = memoryLedgerWithLog();
  const outcome = await driveInteractiveSession({
    repoRoot,
    graph: "g",
    node,
    role: "implementer",
    acceptance: "a fixture node",
    nodeGates: [],
    localConfig,
    agentRuntime,
    standingGates: [],
    substrate: noneClient(),
    ledger,
    clock,
    narrate: () => undefined,
    runtime,
    runnerIdPrefix: "test",
    composeBrief: (worktreePath) =>
      Promise.resolve(ok({ path: join(worktreePath, "README.md"), narration: [] })),
  });
  const narrated = events.flatMap((event) =>
    event.kind === "session-narrated" ? [event.line] : [],
  );
  return { outcome, narrated, events };
}

const ARGV_LINE = "agent argv ";

export function narratedArgv(narrated: readonly string[]): readonly unknown[] {
  return narrated
    .filter((line) => line.startsWith(ARGV_LINE))
    .map((line): unknown => JSON.parse(line.slice(ARGV_LINE.length)));
}
