import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { CODEX_CANONICAL_LINE_LIMIT, prepareCodexLaunch } from "../src/codex/config.ts";
import { agentEnvironmentArgs } from "../src/codex/environment.ts";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { prepareLaunch } from "../src/sessionDrive.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRoot(name: string): string {
  directory = mkdtempSync(join(runsRoot, `${name}-`));
  return directory;
}

function environment(home: string): Readonly<Record<string, string>> {
  return {
    INTERLOCK_SESSION: "session",
    INTERLOCK_GRAPH: "0060-headless-runtime",
    INTERLOCK_NODE: "marker-never-dropped",
    CODEX_HOME: home,
  };
}

function runtime(args: readonly string[] = []): ResolvedRuntime {
  return {
    name: "codex",
    source: "catalogue",
    commits: "agent",
    kind: "codex",
    args,
    model: "fixture-model",
    startupAnswers: [],
    startupTimeoutMs: 1,
    promptTakenTimeoutMs: 1,
    readySettleMs: 0,
    promptRetries: 0,
    writableRootArgs: undefined,
  };
}

function codexHome(root: string, body: string): string {
  const home = join(root, "codex-home");
  mkdirSync(home);
  writeFileSync(join(home, "config.toml"), body);
  return home;
}

describe("Codex marker delivery policy", () => {
  it("uses a launch-local overlay when marker argv would cross the byte limit", () => {
    const root = fixtureRoot("marker-overlay");
    const names = Array.from({ length: 12 }, (_, index) => `server_${index}_${"x".repeat(48)}`);
    const home = codexHome(
      root,
      names.map((name) => `[mcp_servers.${name}]\ncommand = "fixture"\n`).join("\n"),
    );
    const result = prepareCodexLaunch([], root, environment(home), {
      listCodexMcp: () => ok(names),
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.path).toBe("overlay");
    expect(result.value.args.some((argument) => argument.startsWith("mcp_servers."))).toBe(false);
    expect(result.value.environment["CODEX_HOME"]).not.toBe(home);
    const overlayHome = result.value.environment["CODEX_HOME"];
    expect(overlayHome).toBeDefined();
    if (overlayHome === undefined) return;
    const profile = result.value.args[result.value.args.length - 1];
    expect(profile).toBe("interlock-session");
    const profilePath = join(overlayHome, `${profile}.config.toml`);
    const profileText = readFileSync(profilePath, "utf8");
    expect(profileText).toContain("mcp_servers.server_0_");
    expect(profileText).toContain('INTERLOCK_SESSION = "session"');
    result.value.cleanup();
    expect(existsSync(overlayHome)).toBe(false);
  });

  it("refuses an irreducible launch line at the byte limit", () => {
    const root = fixtureRoot("marker-base-limit");
    const home = codexHome(root, "");
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
    expect(result.error.servers).toEqual([]);
    expect(result.error.because).toContain("remains at or above");
  });

  it("counts UTF-8 bytes rather than JavaScript characters", () => {
    const root = fixtureRoot("marker-utf8");
    const home = codexHome(root, '[mcp_servers.fixture]\ncommand = "fixture"\n');
    const values = environment(home);
    const base = agentEnvironmentArgs("codex", ["x".repeat(450), "é".repeat(30)], values, []);
    const withMarker = agentEnvironmentArgs("codex", ["x".repeat(450), "é".repeat(30)], values, [
      "fixture",
    ]);
    expect(["codex", ...base].join(" ").length).toBeLessThan(CODEX_CANONICAL_LINE_LIMIT);
    expect(Buffer.byteLength(["codex", ...withMarker].join(" "), "utf8")).toBeGreaterThanOrEqual(
      CODEX_CANONICAL_LINE_LIMIT,
    );
    const result = prepareCodexLaunch(["x".repeat(450), "é".repeat(30)], root, values, {
      listCodexMcp: () => ok(["fixture"]),
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.path).toBe("overlay");
  });

  it("refuses a project or selector marker conflict by server name", () => {
    const root = fixtureRoot("marker-conflict");
    mkdirSync(join(root, ".codex"));
    writeFileSync(
      join(root, ".codex", "config.toml"),
      '[mcp_servers.project]\ncommand = "fixture"\nenv = { INTERLOCK_SESSION = "project-value" }\n',
    );
    const home = codexHome(root, "");
    const result = prepareCodexLaunch(
      ["-c", 'mcp_servers.project.env.INTERLOCK_GRAPH = "selector-value"'],
      root,
      environment(home),
      { listCodexMcp: () => ok(["project"]) },
    );
    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error.servers).toEqual(["project"]);
    expect(result.error.because).toContain("project.INTERLOCK_SESSION");
  });

  it("marks a server that exists only in the selected launch profile", () => {
    const root = fixtureRoot("marker-profile");
    const home = codexHome(root, "");
    writeFileSync(
      join(home, "fast.config.toml"),
      '[mcp_servers.profile_only]\ncommand = "fixture"\n',
    );
    const launch = prepareLaunch(runtime(["--profile", "fast"]), root, environment(home), {
      listCodexMcp: () => ok(["profile_only"]),
    });
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.args).toContain(
      'mcp_servers.profile_only.env.INTERLOCK_NODE="marker-never-dropped"',
    );
    launch.value.cleanup?.();
  });
});
