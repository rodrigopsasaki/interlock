import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterAll, afterEach, beforeAll, describe, expect } from "vitest";
import { prepareCodexLaunch } from "../src/codex/config.ts";
import {
  reapRegisteredGuardLaunches,
  reapRegisteredGuardLaunchesSync,
  registeredGuardLaunchCount,
} from "./support/codexGuardAssertions.ts";
import { startLoopbackProvider } from "./support/loopbackProvider.ts";
import { slowIntegration } from "./support/slowIntegration.ts";
import { isolatedHomeEnvironment } from "./support/toolState.ts";

let directory: string | undefined;
const previousGitCeiling = process.env["GIT_CEILING_DIRECTORIES"];

beforeAll(() => {
  process.env["GIT_CEILING_DIRECTORIES"] = tmpdir();
});

afterAll(() => {
  if (previousGitCeiling === undefined) delete process.env["GIT_CEILING_DIRECTORIES"];
  else process.env["GIT_CEILING_DIRECTORIES"] = previousGitCeiling;
});

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("real Codex marker overflow delivery", () => {
  slowIntegration(
    "keeps every configured server marked through the launch-local profile",
    {
      budgetMs: 10_000,
      reason: "integrates real Codex MCP discovery across the overflow profile",
    },
    async () => {
      const isolation = isolatedHomeEnvironment("real-codex-marker-overflow");
      directory = isolation.root;
      const home = join(directory, "codex-home");
      mkdirSync(home);
      const names = Array.from({ length: 12 }, (_, index) => `overflow_${index}_${"x".repeat(48)}`);
      writeFileSync(
        join(home, "config.toml"),
        names.map((name) => `[mcp_servers.${name}]\ncommand = "/bin/echo"\n`).join("\n"),
      );
      const environment = {
        ...isolation.environment,
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
      expect(registeredGuardLaunchCount()).toBeGreaterThan(0);
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
      launch.value.cleanup(true);
      reapRegisteredGuardLaunchesSync();
      expect(readFileSync(join(home, "config.toml"), "utf8")).toContain(names[0]);
    },
  );

  slowIntegration(
    "records marker values in real MCP children started by Codex exec",
    {
      budgetMs: 45_000,
      reason: "integrates real Codex exec with fixture MCP child processes and bounded cleanup",
    },
    async () => {
      const isolation = isolatedHomeEnvironment("real-codex-mcp-overflow");
      const root = isolation.root;
      directory = root;
      const home = join(root, "codex-home");
      mkdirSync(home);
      const fixture = join(import.meta.dirname, "fixtures", "codex", "recordMcpEnvironment.mjs");
      const names = Array.from({ length: 4 }, (_, index) => `overflow_${index}_${"x".repeat(120)}`);
      const outputPaths = names.map((name) => join(root, `${name}.json`));
      const provider = await startLoopbackProvider();
      try {
        writeFileSync(
          join(home, "config.toml"),
          [
            'model_provider = "overflow-fixture"',
            'model = "overflow-fixture"',
            `[model_providers.overflow-fixture]\nname = "overflow-fixture"\nbase_url = ${JSON.stringify(provider.url)}\nwire_api = "responses"\nenv_key = "OVERFLOW_API_KEY"`,
            ...names.map((name, index) => {
              const output = outputPaths[index];
              if (output === undefined) throw new Error(`missing output path for ${name}`);
              return `[mcp_servers.${name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(fixture)}, ${JSON.stringify(output)}]\n`;
            }),
          ].join("\n\n"),
        );
        const environment = {
          ...isolation.environment,
          INTERLOCK_SESSION: "real-mcp-session",
          INTERLOCK_GRAPH: "0060-headless-runtime",
          INTERLOCK_NODE: "marker-never-dropped",
          CODEX_HOME: home,
          OVERFLOW_API_KEY: "fixture-key",
        };
        const launch = prepareCodexLaunch([], root, environment);
        expect(isOk(launch)).toBe(true);
        if (!isOk(launch)) return;
        expect(launch.value.path).toBe("overlay");
        const command = await runCodex(
          [...launch.value.args, "exec", "--skip-git-repo-check", "marker proof"],
          root,
          launch.value.environment,
        );
        expect(registeredGuardLaunchCount()).toBeGreaterThan(0);
        if (!outputPaths.every((output) => existsSync(output))) {
          throw new Error(
            `Codex did not start every MCP fixture child (exit ${String(command.code)}): ${command.stderr}`,
          );
        }
        for (const output of outputPaths) {
          expect(JSON.parse(readFileSync(output, "utf8"))).toEqual({
            INTERLOCK_SESSION: "real-mcp-session",
            INTERLOCK_GRAPH: "0060-headless-runtime",
            INTERLOCK_NODE: "marker-never-dropped",
          });
        }
        launch.value.cleanup(true);
        expect(readFileSync(join(home, "config.toml"), "utf8")).toContain(names[0]);
      } finally {
        try {
          await reapRegisteredGuardLaunches();
        } finally {
          await provider.close();
        }
      }
    },
  );
});

function runCodex(
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>>,
): Promise<{ readonly code: number | null; readonly stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ["pipe", "ignore", "pipe"],
      detached: true,
    });
    let stderr = "";
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ code, stderr });
    };
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", () => finish(null));
    child.once("close", (code) => finish(code));
    child.stdin.end("\u0003");
    timer = setTimeout(() => {
      if (child.pid !== undefined) {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {}
      }
      child.kill("SIGTERM");
    }, 15_000);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
