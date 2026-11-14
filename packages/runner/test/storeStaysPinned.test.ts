import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr, isOk } from "@phyxiusjs/fp";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { runSetupCommand } from "../src/worktreeSetup.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

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
  writeFileSync(
    mise,
    '#!/bin/sh\nif [ "$1" = "exec" ] && [ "$2" = "--" ]; then shift 2; fi\nexec "$@"\n',
  );
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
      'if [ "$1" = "test" ]; then',
      '  if [ "$npm_config_store_dir" != "$RECORDED_STORE" ]; then',
      '    rm -f "$WORKTREE/node_modules/.modules.yaml" "$WORKTREE/packages/runner/node_modules/vitest"',
      "  fi",
      '  printf "%s\\n" "Tests 1 passed (1)"',
      "  exit 0",
      "fi",
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
    RECORDED_STORE: "/fixture/store-a",
    WORKTREE: root,
    FAIL_INSTALL: failInstall ? "1" : "0",
    npm_config_store_dir: defaultStore,
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

  it("keeps module metadata and the vitest link through the full test gate", async () => {
    const root = fixtureDir();
    const commands = fakeCommands(root);
    const vitestTarget = join(root, "vitest-target");
    const vitestLink = join(root, "packages", "runner", "node_modules", "vitest");
    mkdirSync(join(root, "packages", "runner", "node_modules"), { recursive: true });
    writeFileSync(vitestTarget, "fixture vitest");
    symlinkSync(vitestTarget, vitestLink);
    modulesFile(root, "storeDir: /fixture/store-a\n");
    gitInitFixtureWithContent(root);

    const beforeModules = readFileSync(join(root, "node_modules", ".modules.yaml"), "utf8");
    const beforeVitestLink = readlinkSync(vitestLink);
    const ledger = memoryLedger();
    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node: { graph: "fixture", id: "store-stays-pinned" },
      session: "session",
      declaredGateIds: ["full-suite"],
      commandFor: new Map([["full-suite", { kind: "command", run: "pnpm test" }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: [],
      commitSha: "deadbeef",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      env: fixtureEnvironment(root, commands.bin, "/fixture/store-b", join(root, "result.txt")),
      heavy: [commands.mise],
      narrate: () => {},
    });

    expect(isOk(judged)).toBe(true);
    expect(readFileSync(join(root, "node_modules", ".modules.yaml"), "utf8")).toBe(beforeModules);
    expect(readlinkSync(vitestLink)).toBe(beforeVitestLink);
  });
});
