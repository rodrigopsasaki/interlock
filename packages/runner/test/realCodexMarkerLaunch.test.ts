import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import type { ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { prepareLaunch } from "../src/sessionDrive.ts";
import {
  reapRegisteredGuardLaunchesSync,
  registeredGuardLaunchCount,
} from "./support/codexGuardAssertions.ts";
import { isolatedHomeEnvironment } from "./support/toolState.ts";

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function runtime(): ResolvedRuntime {
  return {
    name: "codex",
    source: "catalogue",
    commits: "agent",
    kind: "codex",
    args: [],
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

describe("real Codex marker launch", () => {
  it("runs codex mcp list and carries the marker to configured dialeto", () => {
    const isolation = isolatedHomeEnvironment("real-codex-marker");
    const root = isolation.root;
    directory = root;
    const home = join(root, "codex-home");
    mkdirSync(home);
    writeFileSync(
      join(home, "config.toml"),
      `[mcp_servers.dialeto]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(join(import.meta.dirname, "fixtures", "exec", "appendEnvironment.mjs"))}, ${JSON.stringify(join(root, "server-env.jsonl"))}]\n`,
    );
    const environment = {
      ...isolation.environment,
      INTERLOCK_SESSION: "real-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "marker-configured-servers-only",
      CODEX_HOME: home,
    };
    const launch = prepareLaunch(runtime(), root, environment);
    expect(isOk(launch)).toBe(true);
    if (!isOk(launch)) return;
    const output = execFileSync("codex", [...launch.value.args, "mcp", "list", "--json"], {
      cwd: root,
      env: { ...process.env, ...launch.value.environment },
      encoding: "utf8",
    });
    expect(registeredGuardLaunchCount()).toBeGreaterThan(0);
    reapRegisteredGuardLaunchesSync();
    const listed: unknown = JSON.parse(output);
    expect(Array.isArray(listed)).toBe(true);
    if (!Array.isArray(listed)) return;
    const dialeto = listed.find(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && entry["name"] === "dialeto",
    );
    expect(dialeto).toBeDefined();
    if (dialeto === undefined) return;
    const transport = dialeto["transport"];
    expect(typeof transport).toBe("object");
    if (!record(transport)) return;
    expect(transport["env"]).toEqual({
      INTERLOCK_SESSION: "real-session",
      INTERLOCK_GRAPH: "0060-headless-runtime",
      INTERLOCK_NODE: "marker-configured-servers-only",
    });
  });
});
