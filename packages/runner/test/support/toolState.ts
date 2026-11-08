import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fixtureGit } from "../../../../test/support/gitFixture.ts";

export interface ToolState {
  readonly directory: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly cleanup: () => void;
}

function repositoryRoot(): string {
  return fixtureGit(["rev-parse", "--show-toplevel"]).trim();
}

function worktreeRoots(root: string): readonly string[] {
  const output = fixtureGit(["worktree", "list", "--porcelain"], { cwd: root });
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length))
    .filter((path) => path.length > 0)
    .map((path) => realpathSync(path));
}

function protectedRoots(root: string): readonly string[] {
  const checkout = realpathSync(root);
  const commonDirectory = fixtureGit(["rev-parse", "--git-common-dir"], { cwd: checkout }).trim();
  const repository = dirname(resolve(checkout, commonDirectory));
  const worktrees = join(repository, ".worktrees");
  return [repository, checkout, worktrees, ...worktreeRoots(checkout)].map((path) => resolve(path));
}

function contains(root: string, path: string): boolean {
  const remainder = relative(root, path);
  return remainder === "" || (!remainder.startsWith("..") && !isAbsolute(remainder));
}

function assertOutsideProtectedRoots(path: string): void {
  for (const root of protectedRoots(repositoryRoot())) {
    if (contains(root, path)) {
      throw new Error(`tool state is inside protected repository root: ${path} -> ${root}`);
    }
  }
}

export function allocateToolState(prefix: string): ToolState {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), `interlock-${prefix}-`)));
  try {
    assertOutsideProtectedRoots(directory);
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }

  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: join(directory, "home"),
    XDG_CONFIG_HOME: join(directory, "config-home"),
    XDG_DATA_HOME: join(directory, "data-home"),
    XDG_STATE_HOME: join(directory, "state-home"),
    CODEX_HOME: join(directory, "codex-home"),
    MISE_STATE_DIR: directory,
    MISE_DATA_DIR: join(directory, "mise-data"),
    MISE_CONFIG_DIR: join(directory, "mise-config"),
    MISE_CONFIG_FILE: join(directory, "mise.toml"),
    MISE_AUTO_INSTALL: "0",
  };
  mkdirSync(environment["HOME"] ?? join(directory, "home"), { recursive: true });
  mkdirSync(environment["XDG_CONFIG_HOME"] ?? join(directory, "config-home"), { recursive: true });
  mkdirSync(environment["XDG_DATA_HOME"] ?? join(directory, "data-home"), { recursive: true });
  mkdirSync(environment["XDG_STATE_HOME"] ?? join(directory, "state-home"), { recursive: true });
  mkdirSync(environment["CODEX_HOME"] ?? join(directory, "codex-home"), { recursive: true });
  mkdirSync(environment["MISE_DATA_DIR"] ?? join(directory, "mise-data"), { recursive: true });
  mkdirSync(environment["MISE_CONFIG_DIR"] ?? join(directory, "mise-config"), { recursive: true });
  writeFileSync(environment["MISE_CONFIG_FILE"] ?? join(directory, "mise.toml"), "");

  let cleaned = false;
  return {
    directory,
    environment,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

export function isolatedHomeEnvironment(prefix: string): {
  readonly root: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly cleanup: () => void;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `interlock-${prefix}-`)));
  assertOutsideProtectedRoots(root);
  const home = join(root, "home");
  const state = join(root, "state");
  const codex = join(root, "codex");
  mkdirSync(home, { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(codex, { recursive: true });
  return {
    root,
    environment: {
      ...process.env,
      HOME: home,
      XDG_STATE_HOME: state,
      CODEX_HOME: codex,
    },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}
