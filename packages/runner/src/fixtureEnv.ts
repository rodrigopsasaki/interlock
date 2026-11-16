import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface FixtureEnvironmentOptions {
  readonly testWorkers?: number;
  readonly heapMb?: number;
  readonly baseEnv?: NodeJS.ProcessEnv;
  readonly miseCeilingPaths?: string;
}

export interface FixtureEnvironment {
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
  readonly cleanup: () => void;
}

function directories(root: string): readonly string[] {
  return [
    join(root, "home"),
    join(root, "xdg-config"),
    join(root, "xdg-data"),
    join(root, "xdg-cache"),
    join(root, "xdg-state"),
    join(root, "mise-state"),
    join(root, "mise-data"),
    join(root, "mise-cache"),
    join(root, "mise-config"),
    join(root, "corepack"),
    join(root, "pnpm"),
  ];
}

export function createFixtureEnvironment(
  options: FixtureEnvironmentOptions = {},
): FixtureEnvironment {
  const root = mkdtempSync(join(tmpdir(), "interlock-land-fixture-"));
  const [
    home,
    config,
    data,
    cache,
    state,
    miseState,
    miseData,
    miseCache,
    miseConfig,
    corepack,
    pnpm,
  ] = directories(root);
  for (const directory of directories(root)) mkdirSync(directory, { recursive: true });

  const baseEnv = options.baseEnv ?? process.env;
  const ceiling = options.miseCeilingPaths ?? baseEnv["HOME"] ?? root;
  const env: NodeJS.ProcessEnv = {
    ...baseEnv,
    HOME: home,
    XDG_CONFIG_HOME: config,
    XDG_DATA_HOME: data,
    XDG_CACHE_HOME: cache,
    XDG_STATE_HOME: state,
    MISE_CEILING_PATHS: ceiling,
    MISE_STATE_DIR: miseState,
    MISE_DATA_DIR: miseData,
    MISE_CACHE_DIR: miseCache,
    MISE_CONFIG_DIR: miseConfig,
    COREPACK_HOME: corepack,
    PNPM_HOME: pnpm,
    NPM_CONFIG_USERCONFIG: join(root, "npmrc"),
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "interlock fixture",
    GIT_AUTHOR_EMAIL: "interlock-fixture@example.invalid",
    GIT_COMMITTER_NAME: "interlock fixture",
    GIT_COMMITTER_EMAIL: "interlock-fixture@example.invalid",
  };
  if (options.testWorkers !== undefined) {
    env["VITEST_MAX_WORKERS"] = String(options.testWorkers);
    env["VITEST_MAX_THREADS"] = String(options.testWorkers);
    env["VITEST_MAX_FORKS"] = String(options.testWorkers);
  }
  if (options.heapMb !== undefined) env["NODE_OPTIONS"] = `--max-old-space-size=${options.heapMb}`;

  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned) return;
    cleaned = true;
    rmSync(root, { recursive: true, force: true });
  };
  return { root, env, cleanup };
}

export const fixtureEnvironment = createFixtureEnvironment;
