import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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

describe("real Codex marker overflow delivery", () => {
  it("keeps every configured server marked through the launch-local profile", () => {
    directory = mkdtempSync(join(runsRoot, "real-codex-marker-overflow-"));
    const home = join(directory, "codex-home");
    mkdirSync(home);
    const names = Array.from({ length: 12 }, (_, index) => `overflow_${index}_${"x".repeat(48)}`);
    writeFileSync(
      join(home, "config.toml"),
      names.map((name) => `[mcp_servers.${name}]\ncommand = "/bin/echo"\n`).join("\n"),
    );
    const environment = {
      INTERLOCK_SESSION: "real-overflow-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "marker-never-dropped",
      CODEX_HOME: home,
    };
    const launch = prepareCodexLaunch([], directory, environment);
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.path).toBe("overlay");
    const output = execFileSync("codex", [...launch.value.args, "mcp", "list", "--json"], {
      cwd: directory,
      env: { ...process.env, ...launch.value.environment },
      encoding: "utf8",
    });
    const listed: unknown = JSON.parse(output);
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    for (const name of names) {
      const entry = listed.find(
        (value): value is Record<string, unknown> =>
          typeof value === "object" && value !== null && value["name"] === name,
      );
      expect(entry).toBeDefined();
      if (entry === undefined) continue;
      const transport = entry["transport"];
      expect(typeof transport).toBe("object");
      if (!isRecord(transport)) continue;
      expect(transport["env"]).toEqual({
        INTERLOCK_SESSION: "real-overflow-session",
        INTERLOCK_GRAPH: "0060-headless-runtime",
        INTERLOCK_NODE: "marker-never-dropped",
      });
    }
    launch.value.cleanup();
    expect(readFileSync(join(home, "config.toml"), "utf8")).toContain(names[0]);
  });

  it("records marker values in real MCP children started by Codex exec", ({ skip }) => {
    directory = mkdtempSync(join(runsRoot, "real-codex-mcp-overflow-"));
    const home = join(directory, "codex-home");
    mkdirSync(home);
    const fixture = join(import.meta.dirname, "fixtures", "codex", "recordMcpEnvironment.mjs");
    const names = Array.from({ length: 4 }, (_, index) => `overflow_${index}_${"x".repeat(120)}`);
    const outputPaths = names.map((name) => join(directory, `${name}.json`));
    writeFileSync(
      join(home, "config.toml"),
      names
        .map(
          (name, index) =>
            `[mcp_servers.${name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(fixture)}, ${JSON.stringify(outputPaths[index])}]\n`,
        )
        .join("\n"),
    );
    const environment = {
      INTERLOCK_SESSION: "real-mcp-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "marker-never-dropped",
      CODEX_HOME: home,
    };
    const launch = prepareCodexLaunch([], directory, environment);
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    expect(launch.value.path).toBe("overlay");
    let commandError: unknown;
    try {
      execFileSync("codex", [...launch.value.args, "exec", "--skip-git-repo-check", "marker proof"], {
        cwd: directory,
        env: { ...process.env, ...launch.value.environment },
        input: "\u0003",
        encoding: "utf8",
        timeout: 15_000,
      });
    } catch (error) {
      commandError = error;
    }
    if (!outputPaths.every((output) => existsSync(output))) {
      const detail = commandError instanceof Error ? commandError.message : String(commandError);
      if (!/401|unauthorized|missing bearer|not logged in/i.test(detail)) {
        throw commandError;
      }
      skip("Codex is not logged in and did not start the MCP fixture before the model call.");
    }
    for (const output of outputPaths) {
      expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
        INTERLOCK_SESSION: "real-mcp-session",
        INTERLOCK_GRAPH: "0060-headless-runtime",
        INTERLOCK_NODE: "marker-never-dropped",
      });
    }
    launch.value.cleanup();
    expect(readFileSync(join(home, "config.toml"), "utf8")).toContain(names[0]);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
