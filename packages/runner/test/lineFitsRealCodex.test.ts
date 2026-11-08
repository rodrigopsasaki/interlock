import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import { prepareCodexLaunch } from "../src/codex/config.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("real Codex line fitting", () => {
  it("applies moved shell policy and marker values to a real MCP child", ({ skip }) => {
    const root = mkdtempSync(join(runsRoot, "line-fit-real-codex-"));
    directory = root;
    const home = join(root, "codex-home");
    mkdirSync(home);
    const output = join(root, "mcp-environment.json");
    const fixture = join(import.meta.dirname, "fixtures", "codex", "recordShellEnvironment.mjs");
    const names = Array.from({ length: 12 }, (_, index) => `line_fit_${index}_${"x".repeat(48)}`);
    writeFileSync(
      join(home, "config.toml"),
      [
        '[shell_environment_policy]\ninherit = "none"',
        ...names.map((name, index) => {
          if (index !== 0) return `[mcp_servers.${name}]\ncommand = "/bin/echo"`;
          return `[mcp_servers.${name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(fixture)}, ${JSON.stringify(output)}]`;
        }),
      ].join("\n\n"),
    );
    const environment = {
      NODE_OPTIONS: "--max-old-space-size=3072",
      VITEST_MAX_WORKERS: "4",
      VITEST_MAX_THREADS: "4",
      VITEST_MAX_FORKS: "4",
      VITEST_MIN_THREADS: "1",
      VITEST_MIN_FORKS: "1",
      INTERLOCK_SESSION: "line-fit-real-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "line-fits-real-codex",
      CODEX_HOME: home,
    };
    const launch = prepareCodexLaunch([], root, environment);
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.path).toBe("overlay");
    const overlayHome = launch.value.environment["CODEX_HOME"];
    const profile = launch.value.args[launch.value.args.length - 1];
    expect(overlayHome).toBeDefined();
    expect(profile).toBeDefined();
    if (overlayHome === undefined || profile === undefined) return;
    const profileText = readFileSync(join(overlayHome, `${profile}.config.toml`), "utf8");
    expect(profileText).toContain('NODE_OPTIONS = "--max-old-space-size=3072"');
    expect(profileText).toContain('VITEST_MAX_WORKERS = "4"');
    let commandError: unknown;
    try {
      execFileSync(
        "codex",
        [...launch.value.args, "exec", "--skip-git-repo-check", "line fit proof"],
        {
          cwd: root,
          env: { ...process.env, ...launch.value.environment },
          input: "\u0003",
          encoding: "utf8",
          timeout: 15_000,
        },
      );
    } catch (error) {
      commandError = error;
    }
    if (!existsSync(output)) {
      const detail = commandError instanceof Error ? commandError.message : String(commandError);
      if (/401|unauthorized|missing bearer|not logged in/i.test(detail)) {
        skip();
        return;
      }
      throw commandError;
    }
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
      INTERLOCK_SESSION: "line-fit-real-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "line-fits-real-codex",
    });
    launch.value.cleanup();
  });
});
