import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { CODEX_CANONICAL_LINE_LIMIT, prepareCodexLaunch } from "../src/codex/config.ts";
import { agentEnvironmentArgs } from "../src/codex/environment.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;
const previousGitCeiling = process.env["GIT_CEILING_DIRECTORIES"];

beforeAll(() => {
  process.env["GIT_CEILING_DIRECTORIES"] = join(runsRoot, "..");
});

afterAll(() => {
  if (previousGitCeiling === undefined) delete process.env["GIT_CEILING_DIRECTORIES"];
  else process.env["GIT_CEILING_DIRECTORIES"] = previousGitCeiling;
});

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRoot(name: string): string {
  directory = mkdtempSync(join(runsRoot, `${name}-`));
  return directory;
}

function serverNames(): readonly string[] {
  return Array.from({ length: 12 }, (_, index) => `server_${index}_${"x".repeat(48)}`);
}

function codexHome(root: string, body: string): string {
  const home = join(root, "codex-home");
  mkdirSync(home);
  writeFileSync(
    join(home, "config.toml"),
    `${body}\n${serverNames()
      .map((name) => `[mcp_servers.${name}]\ncommand = "fixture"`)
      .join("\n")}`,
  );
  return home;
}

function environment(home: string): Readonly<Record<string, string>> {
  const root = join(home, "..");
  return {
    HOME: join(root, "home"),
    XDG_STATE_HOME: join(root, "state"),
    NODE_OPTIONS: "--max-old-space-size=3072",
    VITEST_MAX_WORKERS: "4",
    VITEST_MAX_THREADS: "4",
    VITEST_MAX_FORKS: "4",
    VITEST_MIN_THREADS: "1",
    VITEST_MIN_FORKS: "1",
    INTERLOCK_SESSION: "line-fit-session",
    INTERLOCK_GRAPH: "0060-headless-runtime",
    INTERLOCK_NODE: "line-fits-node-with-a-long-name",
    CODEX_HOME: home,
  };
}

function launch(
  root: string,
  home: string,
  args: readonly string[] = [],
): ReturnType<typeof prepareCodexLaunch> {
  return prepareCodexLaunch(args, root, environment(home), {
    listCodexMcp: () => ok(serverNames()),
  });
}

function overlayProfile(result: ReturnType<typeof prepareCodexLaunch>): string {
  if (!isOk(result)) throw new Error(result.error.because);
  const home = result.value.environment["CODEX_HOME"];
  const profile = result.value.args[result.value.args.length - 1];
  if (home === undefined || profile === undefined) throw new Error("overlay is incomplete");
  return readFileSync(join(home, `${profile}.config.toml`), "utf8");
}

describe("Codex launch line fitting", () => {
  it("moves safe generated policy keys into one overlay table under the byte limit", () => {
    const root = fixtureRoot("line-fit-overlay");
    const home = codexHome(root, '[shell_environment_policy]\ninherit = "none"\n');
    const result = launch(root, home);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.path).toBe("overlay");
    expect(Buffer.byteLength(["codex", ...result.value.args].join(" "), "utf8")).toBeLessThan(
      CODEX_CANONICAL_LINE_LIMIT,
    );
    expect(result.value.args).not.toContain(
      'shell_environment_policy.set.NODE_OPTIONS="--max-old-space-size=3072"',
    );
    const profile = overlayProfile(result);
    expect(profile).toContain("[shell_environment_policy.set]");
    expect(profile).toContain('NODE_OPTIONS = "--max-old-space-size=3072"');
    expect(profile).toContain('INTERLOCK_NODE = "line-fits-node-with-a-long-name"');
    result.value.cleanup(true);
  });

  it("keeps a selected profile's final table intact before generated tables", () => {
    const root = fixtureRoot("line-fit-profile-table");
    const home = codexHome(root, 'profile = "fast"');
    writeFileSync(join(home, "fast.config.toml"), "[features]\nresponses_websocket = true\n");
    const result = launch(root, home, ["--profile", "fast"]);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const profile = overlayProfile(result);
    expect(profile).toContain("[features]\nresponses_websocket = true");
    expect(profile).toContain("[mcp_servers.server_0_");
    expect(profile).toContain("[shell_environment_policy.set]");
    result.value.cleanup(true);
  });

  it("keeps a generated key on argv when trusted project configuration sets it", () => {
    const root = fixtureRoot("line-fit-project-precedence");
    const home = codexHome(root, "");
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      '[shell_environment_policy.set]\nNODE_OPTIONS = "project-value"\n',
    );
    const result = launch(root, home);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.args).toContain(
      'shell_environment_policy.set.NODE_OPTIONS="--max-old-space-size=3072"',
    );
    expect(overlayProfile(result)).not.toContain("NODE_OPTIONS =");
    result.value.cleanup(true);
  });

  it("keeps a generated key on argv when runtime configuration sets it", () => {
    const root = fixtureRoot("line-fit-selector-precedence");
    const home = codexHome(root, "");
    const result = launch(root, home, [
      "-c",
      'shell_environment_policy.set.VITEST_MAX_WORKERS="runtime-value"',
    ]);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.args).toContain('shell_environment_policy.set.VITEST_MAX_WORKERS="4"');
    expect(result.value.args).toContain(
      'shell_environment_policy.set.VITEST_MAX_WORKERS="runtime-value"',
    );
    expect(overlayProfile(result)).not.toContain("VITEST_MAX_WORKERS =");
    result.value.cleanup(true);
  });

  it("keeps base-only policy in the effective overlay configuration", () => {
    const root = fixtureRoot("line-fit-base-policy");
    const home = codexHome(
      root,
      '[shell_environment_policy]\ninherit = "none"\n[shell_environment_policy.set]\nBASE_ONLY = "base-value"\n',
    );
    const result = launch(root, home);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const overlayHome = result.value.environment["CODEX_HOME"];
    expect(overlayHome).toBeDefined();
    if (overlayHome === undefined) return;
    expect(readFileSync(join(overlayHome, "config.toml"), "utf8")).toContain(
      'BASE_ONLY = "base-value"',
    );
    result.value.cleanup(true);
  });

  it("leaves the argv path unchanged when the full line fits", () => {
    const root = fixtureRoot("line-fit-argv");
    const home = join(root, "codex-home");
    mkdirSync(home);
    writeFileSync(join(home, "config.toml"), '[mcp_servers.fixture]\ncommand = "fixture"\n');
    const values = {
      INTERLOCK_SESSION: "short-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "line-fits",
      CODEX_HOME: home,
    };
    const args = ["--add-dir", root, "prompt"];
    const result = prepareCodexLaunch(args, root, values, {
      listCodexMcp: () => ok(["fixture"]),
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.path).toBe("argv");
    expect(result.value.args).toEqual(agentEnvironmentArgs("codex", args, values, ["fixture"]));
  });

  it("refuses an overlay that remains at the canonical limit", () => {
    const root = fixtureRoot("line-fit-refusal");
    const home = join(root, "codex-home");
    mkdirSync(home);
    writeFileSync(join(home, "config.toml"), "");
    const result = prepareCodexLaunch(
      ["x".repeat(CODEX_CANONICAL_LINE_LIMIT)],
      root,
      environment(home),
      {
        listCodexMcp: () => ok([]),
      },
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.because).toContain("remains at or above 1024 UTF-8 bytes");
    expect(result.error.servers).toEqual([]);
  });
});
