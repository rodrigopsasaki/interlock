import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { runSetupCommand } from "../src/worktreeSetup.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) spawnSync("rm", ["-r", directory], { stdio: "ignore" });
  directories = [];
});

function fixtureDir(): string {
  const directory = mkdtempSync(join(runsRoot, "store-stays-pinned-"));
  directories.push(directory);
  return directory;
}

function fakeCommands(root: string): { readonly mise: string; readonly bin: string } {
  const bin = join(root, "bin");
  mkdirSync(bin);
  const mise = join(bin, "mise");
  writeFileSync(mise, '#!/bin/sh\nif [ "$1" = "exec" ] && [ "$2" = "--" ]; then shift 2; fi\nexec "$@"\n');
  chmodSync(mise, 0o755);
  const pnpm = join(bin, "pnpm");
  writeFileSync(
    pnpm,
    [
      "#!/bin/sh",
      'if [ "$1" = "store" ] && [ "$2" = "path" ]; then',
      '  printf "%s\\n" "$DEFAULT_STORE"',
      "  exit 0",
      "fi",
      'if [ "$npm_config_confirm_modules_purge" != "false" ]; then',
      '  printf "%s\\n" "prompted" > "$RESULT"',
      "  exit 9",
      "fi",
      'printf "%s\\n" "store=$npm_config_store_dir" > "$RESULT"',
      'printf "%s\\n" "purge=$npm_config_confirm_modules_purge" >> "$RESULT"',
      'if [ "$FAIL_INSTALL" = "1" ]; then',
      '  printf "%s\\n" "fake install failed"',
      "  exit 7",
      "fi",
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(pnpm, 0o755);
  return { mise, bin };
}

function fixtureEnvironment(
  root: string,
  bin: string,
  defaultStore: string,
  result: string,
  failInstall = false,
): NodeJS.ProcessEnv {
  const home = join(root, "home");
  const xdgConfig = join(root, "xdg-config");
  const xdgData = join(root, "xdg-data");
  const xdgState = join(root, "xdg-state");
  const xdgCache = join(root, "xdg-cache");
  const miseState = join(root, "mise-state");
  const miseData = join(root, "mise-data");
  const miseCache = join(root, "mise-cache");
  const miseConfig = join(root, "mise-config");
  for (const directory of [
    home,
    xdgConfig,
    xdgData,
    xdgState,
    xdgCache,
    miseState,
    miseData,
    miseCache,
    miseConfig,
  ])
    mkdirSync(directory, { recursive: true });
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: xdgConfig,
    XDG_DATA_HOME: xdgData,
    XDG_STATE_HOME: xdgState,
    XDG_CACHE_HOME: xdgCache,
    MISE_CEILING_PATHS: homedir(),
    MISE_STATE_DIR: miseState,
    MISE_DATA_DIR: miseData,
    MISE_CACHE_DIR: miseCache,
    MISE_CONFIG_DIR: miseConfig,
    PATH: `${bin}${delimiter}${process.env["PATH"] ?? ""}`,
    DEFAULT_STORE: defaultStore,
    RESULT: result,
    FAIL_INSTALL: failInstall ? "1" : "0",
  };
}

function modulesFile(root: string, contents: string): void {
  mkdirSync(join(root, "node_modules"), { recursive: true });
  writeFileSync(join(root, "node_modules", ".modules.yaml"), contents);
}

async function runInstall(
  root: string,
  commands: { readonly mise: string; readonly bin: string },
  defaultStore: string,
  result: string,
  failInstall = false,
) {
  return runSetupCommand(
    "pnpm install",
    root,
    fixtureEnvironment(root, commands.bin, defaultStore, result, failInstall),
    [commands.mise],
  );
}

describe("worktree setup store pinning", () => {
  it("uses the store recorded by the worktree and does not prompt to purge", async () => {
    const root = fixtureDir();
    const commands = fakeCommands(root);
    const result = join(root, "result.txt");
    modulesFile(root, "storeDir: /fixture/store-a\n");

    const setup = await runInstall(root, commands, "/fixture/store-b", result);

    expect(isOk(setup)).toBe(true);
    expect(readFileSync(result, "utf8")).toBe("store=/fixture/store-a\npurge=false\n");
  });

  it("uses pnpm's runner default when the worktree has no module metadata", async () => {
    const root = fixtureDir();
    const commands = fakeCommands(root);
    const result = join(root, "result.txt");

    const setup = await runInstall(root, commands, "/fixture/store-b", result);

    expect(isOk(setup)).toBe(true);
    expect(readFileSync(result, "utf8")).toBe("store=/fixture/store-b\npurge=false\n");
  });

  it.each([
    ["invalid YAML", "storeDir: ["],
    ["unreadable metadata", undefined],
  ])("falls back to the default for %s and records the source", async (_label, contents) => {
    const root = fixtureDir();
    const commands = fakeCommands(root);
    const result = join(root, "result.txt");
    gitInitFixtureWithContent(root);
    if (contents === undefined)
      mkdirSync(join(root, "node_modules", ".modules.yaml"), { recursive: true });
    else modulesFile(root, contents);

    const setup = await runInstall(root, commands, "/fixture/store-b", result, true);

    expect(isErr(setup)).toBe(true);
    if (!isErr(setup) || setup.error.kind !== "command-failed") return;
    expect(setup.error.logPath).toBeDefined();
    if (setup.error.logPath === undefined) return;
    expect(readFileSync(setup.error.logPath, "utf8")).toContain(
      "worktree setup store: /fixture/store-b (runner's default)",
    );
    expect(existsSync(join(root, "home", ".local"))).toBe(false);
  });
});
