import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { configuredCodexMcpServers } from "../src/codex/config.ts";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { prepareLaunch } from "../src/sessionDrive.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function runtime(args: readonly string[] = ["--quiet"]): ResolvedRuntime {
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

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stdioNames(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!record(entry) || typeof entry["name"] !== "string") return [];
    const transport = entry["transport"];
    if (!record(transport) || transport["type"] !== "stdio") return [];
    return [entry["name"]];
  });
}

describe("configured Codex marker servers", () => {
  it("keeps built-in names out of overrides when the real list shape is reported", () => {
    const root = mkdtempSync(join(runsRoot, "configured-servers-"));
    directory = root;
    const listed = stdioNames(
      JSON.parse(
        readFileSync(join(import.meta.dirname, "fixtures", "codex", "real-mcp-list.json"), "utf8"),
      ),
    );
    const launch = prepareLaunch(
      runtime(),
      root,
      {
        INTERLOCK_SESSION: "session",
        INTERLOCK_GRAPH: "graph",
        INTERLOCK_NODE: "node",
        CODEX_HOME: join(import.meta.dirname, "fixtures", "codex"),
      },
      { listCodexMcp: () => ok(listed) },
    );
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.args).toContain('mcp_servers.dialeto.env.INTERLOCK_SESSION="session"');
    expect(launch.value.args).toContain('mcp_servers.hypha.env.INTERLOCK_NODE="node"');
    expect(launch.value.args.some((arg) => arg.includes("codex_app"))).toBe(false);
    expect(launch.value.args.some((arg) => arg.includes("computer-use"))).toBe(false);
    expect(launch.value.args.some((arg) => arg.includes("cua_repl"))).toBe(false);
    expect(launch.value.args.some((arg) => arg.includes("node_repl"))).toBe(false);
    expect(["codex", ...launch.value.args].join(" ").length).toBeLessThan(1024);
  });

  it("includes the active profile's configured stdio servers", () => {
    const root = mkdtempSync(join(runsRoot, "configured-profile-"));
    directory = root;
    const home = join(root, "codex-home");
    mkdirSync(home);
    writeFileSync(join(home, "config.toml"), '[mcp_servers.root]\ncommand = "root"\n');
    writeFileSync(join(home, "fast.config.toml"), '[mcp_servers.profiled]\ncommand = "profiled"\n');
    expect(configuredCodexMcpServers(["--profile", "fast"], { CODEX_HOME: home })).toEqual(
      ok(["root", "profiled"]),
    );
  });

  it("keeps a long launch line below the terminal limit by using inherited marker environment", () => {
    const root = mkdtempSync(join(runsRoot, "configured-long-"));
    directory = root;
    const home = join(root, "codex-home");
    mkdirSync(home);
    const names = Array.from({ length: 12 }, (_, index) => `server_${index}_${"x".repeat(48)}`);
    writeFileSync(
      join(home, "config.toml"),
      names.map((name) => `[mcp_servers.${name}]\ncommand = "${name}"\n`).join("\n"),
    );
    const launch = prepareLaunch(
      runtime(),
      root,
      {
        INTERLOCK_SESSION: "session",
        INTERLOCK_GRAPH: "graph",
        INTERLOCK_NODE: "node",
        CODEX_HOME: home,
      },
      { listCodexMcp: () => ok(names) },
    );
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(["codex", ...launch.value.args].join(" ").length).toBeLessThan(1024);
    expect(launch.value.args.some((arg) => arg.startsWith("mcp_servers."))).toBe(false);
    expect(launch.value.environment["INTERLOCK_SESSION"]).toBe("session");
  });
});
