import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, chmodSync, constants, writeFileSync } from "node:fs";
import { basename, delimiter, join } from "node:path";

// The one process boundary through which test fixtures run Git. Every invocation it builds
// carries `-c maintenance.auto=false`: since Git 2.29, commit, merge, fetch, rebase and am end by
// launching `git maintenance run --auto --detach`, a daemon that outlives the command and can
// write packs into a fixture directory while the test is removing it. A command-line `-c` is the
// last configuration Git reads, so neither repository, global nor environment configuration can
// re-enable maintenance under it, and the children Git spawns inherit it.
export const MAINTENANCE_SUPPRESSION = ["-c", "maintenance.auto=false"] as const;

const MAINTENANCE_AUTO = "maintenance.auto";

export interface FixtureGitOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly input?: string | Buffer;
  readonly maxBuffer?: number;
  readonly stdio?: "pipe" | ["ignore", "pipe", "pipe"];
}

function namesMaintenanceAuto(setting: string): boolean {
  const separator = setting.indexOf("=");
  const key = separator === -1 ? setting : setting.slice(0, separator);
  return key.toLowerCase() === MAINTENANCE_AUTO;
}

// Refuses a `-c` or `--config-env` naming maintenance.auto anywhere in the argv: the only
// legitimate value is the one this helper already supplies, and a later one would win.
function refuseSuppressionOverrideInArgs(args: readonly string[]): void {
  args.forEach((arg, index) => {
    const next = args[index + 1];
    const overridden =
      ((arg === "-c" || arg === "--config-env") &&
        next !== undefined &&
        namesMaintenanceAuto(next)) ||
      (arg.startsWith("--config-env=") && namesMaintenanceAuto(arg.slice("--config-env=".length)));
    if (overridden) {
      throw new Error(
        `fixture git refuses an argument overriding ${MAINTENANCE_AUTO}: ${args.join(" ")}`,
      );
    }
  });
}

// Refuses environment that configures maintenance.auto through Git's command-scope channels.
function refuseSuppressionOverrideInEnv(env: NodeJS.ProcessEnv | undefined): void {
  if (env === undefined) return;
  const parameters = env["GIT_CONFIG_PARAMETERS"];
  const viaParameters = parameters?.toLowerCase().includes(MAINTENANCE_AUTO) === true;
  const viaCount = Object.entries(env).some(
    ([name, value]) =>
      /^GIT_CONFIG_KEY_\d+$/.test(name) && value !== undefined && namesMaintenanceAuto(value),
  );
  if (viaParameters || viaCount) {
    throw new Error(`fixture git refuses environment overriding ${MAINTENANCE_AUTO}`);
  }
}

export function fixtureGitArgv(args: readonly string[]): readonly [string, ...string[]] {
  refuseSuppressionOverrideInArgs(args);
  return ["git", ...MAINTENANCE_SUPPRESSION, ...args];
}

const GLOBAL_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--config-env",
]);
const CREATES_REPOSITORY = new Set(["init", "clone"]);

function subcommandOf(args: readonly string[]): string | undefined {
  let expectsValue = false;
  for (const arg of args) {
    if (expectsValue) expectsValue = false;
    else if (GLOBAL_OPTIONS_WITH_VALUE.has(arg)) expectsValue = true;
    else if (!arg.startsWith("-")) return arg;
  }
  return undefined;
}

function runGit(args: readonly string[], options: FixtureGitOptions): string {
  refuseSuppressionOverrideInEnv(options.env);
  const [command, ...rest] = fixtureGitArgv(args);
  return execFileSync(command, rest, { ...options, encoding: "utf-8" });
}

// Repositories are created only through initFixtureRepository and cloneFixtureRepository, so
// none exists without the repository-local suppression production code inherits.
export function fixtureGit(args: readonly string[], options: FixtureGitOptions = {}): string {
  const subcommand = subcommandOf(args);
  if (subcommand !== undefined && CREATES_REPOSITORY.has(subcommand)) {
    throw new Error(
      `fixture git creates a repository only through initFixtureRepository or cloneFixtureRepository: ${args.join(" ")}`,
    );
  }
  return runGit(args, options);
}

export interface FixtureRepositoryOptions {
  readonly defaultBranch?: string;
  readonly initArgs?: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

// Initializes a disposable repository and pins repository-local maintenance.auto=false before
// any production code runs in it, so production Git calls and the linked worktrees that share
// its configuration inherit the same containment the direct fixture commands carry per call.
export function initFixtureRepository(
  directory: string,
  options: FixtureRepositoryOptions = {},
): void {
  const branch =
    options.defaultBranch === undefined
      ? []
      : ["-c", `init.defaultBranch=${options.defaultBranch}`];
  const env = options.env === undefined ? {} : { env: options.env };
  runGit([...branch, "init", "--quiet", ...(options.initArgs ?? [])], { cwd: directory, ...env });
  runGit(["config", MAINTENANCE_AUTO, "false"], { cwd: directory, ...env });
}

// Clones a disposable repository whose own configuration pins maintenance.auto=false.
export function cloneFixtureRepository(
  source: string,
  destination: string,
  cloneArgs: readonly string[] = [],
  options: FixtureGitOptions = {},
): void {
  runGit(
    ["clone", "--config", `${MAINTENANCE_AUTO}=false`, ...cloneArgs, source, destination],
    options,
  );
}

// Runs Git with maintenance left on, for the one positive control that proves the suppression
// matters. It always runs maintenance in the foreground, so no detached writer can outlive it.
export function unsuppressedGitForMaintenanceControl(
  args: readonly string[],
  options: FixtureGitOptions = {},
): string {
  return execFileSync("git", ["-c", "maintenance.autoDetach=false", ...args], {
    ...options,
    encoding: "utf-8",
  });
}

export type SandboxedCommand =
  | { readonly git: readonly string[] }
  | { readonly argv: readonly [string, ...string[]] };

export interface SandboxedRun {
  readonly status: number | null;
  readonly stderr: string;
}

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const GIT_WORD = /(^|[^\w.-])git(?![\w-])/;

function sandboxedArgv(command: SandboxedCommand): readonly [string, ...string[]] {
  if ("git" in command) return fixtureGitArgv(command.git);
  const [program, ...args] = command.argv;
  const name = basename(program);
  if (name === "git" || (SHELLS.has(name) && args.some((arg) => GIT_WORD.test(arg)))) {
    throw new Error(`fixture sandbox refuses git outside the git form: ${command.argv.join(" ")}`);
  }
  return command.argv;
}

// Runs one command under macOS sandbox-exec with the given profile; Git goes through the `git`
// form so its argv carries the same suppression as every other fixture invocation.
export function sandboxedFixtureCommand(
  profile: string,
  cwd: string,
  command: SandboxedCommand,
  env: NodeJS.ProcessEnv,
): SandboxedRun {
  refuseSuppressionOverrideInEnv(env);
  const run = spawnSync("sandbox-exec", ["-p", profile, ...sandboxedArgv(command)], {
    cwd,
    env,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (run.error !== undefined) throw run.error;
  return { status: run.status, stderr: run.stderr };
}

function executableOnPath(name: string): string {
  for (const directory of (process.env["PATH"] ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const candidate = join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  throw new Error(`no ${name} on PATH`);
}

function shellQuoted(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

// Writes an executable `git` at `script` that refuses any invocation naming one of `refused`
// and hands every other one to the Git currently on PATH, with the fixture suppression applied,
// so production code that finds this script first still runs Git with maintenance off.
export function writeGitForwarder(
  script: string,
  refused: readonly string[],
  logPath?: string,
): void {
  const realGit = executableOnPath("git");
  const refusal =
    refused.length === 0
      ? []
      : [
          'for arg in "$@"; do',
          '  case "$arg" in',
          `    ${refused.map(shellQuoted).join("|")}) echo "fixture git refuses $arg" >&2; exit 128 ;;`,
          "  esac",
          "done",
        ];
  writeFileSync(
    script,
    [
      "#!/bin/sh",
      ...(logPath === undefined ? [] : [`printf '%s\\n' "$@" >> ${shellQuoted(logPath)}`]),
      ...refusal,
      `exec ${[realGit, ...MAINTENANCE_SUPPRESSION].map(shellQuoted).join(" ")} "$@"`,
      "",
    ].join("\n"),
  );
  chmodSync(script, 0o755);
}
