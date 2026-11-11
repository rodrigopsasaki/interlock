import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterAll, afterEach, beforeAll, describe, expect } from "vitest";
import { prepareCodexLaunch } from "../src/codex/config.ts";
import {
  registeredGuardLaunchCount,
  reapRegisteredGuardLaunches,
} from "./support/codexGuardAssertions.ts";
import { slowIntegration } from "./support/slowIntegration.ts";
import { isolatedHomeEnvironment } from "./support/toolState.ts";

type JsonObject = Record<string, unknown>;

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

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

async function requestJson(request: IncomingMessage): Promise<JsonObject> {
  let body = "";
  request.setEncoding("utf8");
  for await (const chunk of request) body += chunk;
  const parsed: unknown = JSON.parse(body);
  if (!isRecord(parsed)) throw new Error("the provider request was not a JSON object");
  return parsed;
}

function respond(response: ServerResponse, body: JsonObject): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache");
  const output = Array.isArray(body["output"]) ? body["output"] : [];
  const created = { ...body, status: "in_progress", output: [] };
  const events = [
    `response.created`,
    ...output.flatMap((item, index) => {
      if (!isRecord(item)) return [];
      const itemId = typeof item["id"] === "string" ? item["id"] : `item_${String(index)}`;
      const added = {
        type: "response.output_item.added",
        output_index: index,
        item,
      };
      const done = { type: "response.output_item.done", output_index: index, item };
      if (item["type"] !== "function_call") return [JSON.stringify(added), JSON.stringify(done)];
      const argumentsValue = typeof item["arguments"] === "string" ? item["arguments"] : "";
      return [
        JSON.stringify(added),
        JSON.stringify({
          type: "response.function_call_arguments.delta",
          item_id: itemId,
          output_index: index,
          delta: argumentsValue,
        }),
        JSON.stringify({
          type: "response.function_call_arguments.done",
          item_id: itemId,
          output_index: index,
          arguments: argumentsValue,
        }),
        JSON.stringify(done),
      ];
    }),
  ];
  response.write(`data: ${JSON.stringify({ type: events[0], response: created })}\n\n`);
  for (const event of events.slice(1)) response.write(`data: ${event}\n\n`);
  response.write(`data: ${JSON.stringify({ type: "response.completed", response: body })}\n\n`);
  response.end("data: [DONE]\n\n");
}

function shellCommand(): string {
  const keys = [
    "NODE_OPTIONS",
    "VITEST_MAX_WORKERS",
    "VITEST_MAX_THREADS",
    "VITEST_MAX_FORKS",
    "VITEST_MIN_THREADS",
    "VITEST_MIN_FORKS",
    "INTERLOCK_SESSION",
    "INTERLOCK_GRAPH",
    "INTERLOCK_NODE",
  ];
  const format = keys.map((key) => `${key}=%s`).join("\\n");
  return `printf '${format}\\n' ${keys.map((key) => `"$${key}"`).join(" ")}`;
}

function responseWithShellCall(): JsonObject {
  return {
    id: "resp_line_fit_shell",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: "line-fit-fixture",
    output: [
      {
        id: "function_call_line_fit",
        type: "function_call",
        status: "completed",
        call_id: "function_call_line_fit",
        name: "exec_command",
        arguments: JSON.stringify({ cmd: shellCommand(), yield_time_ms: 10_000 }),
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

function responseWithFinalMessage(): JsonObject {
  return {
    id: "resp_line_fit_final",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: "line-fit-fixture",
    output: [
      {
        id: "message_line_fit_final",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "shell proof complete", annotations: [] }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

async function startProvider(requests: JsonObject[]): Promise<{
  readonly url: string;
  readonly close: () => Promise<void>;
}> {
  const server = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.statusCode = 404;
      response.end();
      return;
    }
    try {
      const body = await requestJson(request);
      requests.push(body);
      respond(
        response,
        requests.length === 1 ? responseWithShellCall() : responseWithFinalMessage(),
      );
    } catch (error) {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error("the loopback provider did not expose a port");
  }
  return {
    url: `http://127.0.0.1:${String(address.port)}/v1`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

async function runCodex(
  args: readonly string[],
  cwd: string,
  environment: Readonly<Record<string, string>>,
): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn("codex", args, {
      cwd,
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk.toString("utf8")));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk.toString("utf8")));
    const timeout = setTimeout(() => child.kill("SIGTERM"), 15_000);
    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({ code, stdout: stdout.join(""), stderr: stderr.join("") });
    });
  });
}

describe("real Codex line fitting", () => {
  slowIntegration(
    "runs a provider shell call with moved policy and marker values",
    {
      budgetMs: 45_000,
      reason: "integrates a loopback provider, real Codex shell call and fixture MCP child",
    },
    async () => {
      const isolation = isolatedHomeEnvironment("line-fit-real-codex");
      const root = isolation.root;
      directory = root;
      const home = join(root, "codex-home");
      mkdirSync(home);
      const output = join(root, "mcp-environment.json");
      const fixture = join(import.meta.dirname, "fixtures", "codex", "recordShellEnvironment.mjs");
      const names = Array.from({ length: 12 }, (_, index) => `line_fit_${index}_${"x".repeat(48)}`);
      const requests: JsonObject[] = [];
      const provider = await startProvider(requests);
      writeFileSync(
        join(home, "config.toml"),
        [
          'model_provider = "line-fit-fixture"',
          'model = "line-fit-fixture"',
          '[shell_environment_policy]\ninherit = "none"',
          `[model_providers.line-fit-fixture]\nname = "line-fit-fixture"\nbase_url = ${JSON.stringify(provider.url)}\nwire_api = "responses"\nenv_key = "LINE_FIT_API_KEY"`,
          ...names.map((name, index) => {
            if (index !== 0) return `[mcp_servers.${name}]\ncommand = "/bin/echo"`;
            return `[mcp_servers.${name}]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(fixture)}, ${JSON.stringify(output)}]`;
          }),
        ].join("\n\n"),
      );
      const environment = {
        ...isolation.environment,
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
        LINE_FIT_API_KEY: "fixture-key",
      };
      try {
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
        const inheritedEnvironment = {
          ...launch.value.environment,
          NODE_OPTIONS: "inherited-node-options",
          VITEST_MAX_WORKERS: "inherited-workers",
          VITEST_MAX_THREADS: "inherited-threads",
          VITEST_MAX_FORKS: "inherited-forks",
          VITEST_MIN_THREADS: "inherited-min-threads",
          VITEST_MIN_FORKS: "inherited-min-forks",
          INTERLOCK_SESSION: "inherited-session",
          INTERLOCK_GRAPH: "inherited-graph",
          INTERLOCK_NODE: "inherited-node",
        };
        const result = await runCodex(
          [...launch.value.args, "exec", "--skip-git-repo-check", "line fit proof"],
          root,
          inheritedEnvironment,
        );
        expect(registeredGuardLaunchCount()).toBeGreaterThan(0);
        expect(result.code, `${result.stdout}\n${result.stderr}\n${JSON.stringify(requests)}`).toBe(
          0,
        );
        expect(requests, JSON.stringify(requests)).toHaveLength(2);
        const followUp = JSON.stringify(requests[1]);
        expect(followUp).toContain("NODE_OPTIONS=--max-old-space-size=3072");
        expect(followUp).toContain("VITEST_MAX_WORKERS=4");
        expect(followUp).toContain("VITEST_MAX_THREADS=4");
        expect(followUp).toContain("VITEST_MAX_FORKS=4");
        expect(followUp).toContain("VITEST_MIN_THREADS=1");
        expect(followUp).toContain("VITEST_MIN_FORKS=1");
        expect(followUp).toContain("INTERLOCK_SESSION=line-fit-real-session");
        expect(followUp).toContain("INTERLOCK_GRAPH=0060-headless-runtime");
        expect(followUp).toContain("INTERLOCK_NODE=line-fits-real-codex");
        expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
          INTERLOCK_SESSION: "line-fit-real-session",
          INTERLOCK_GRAPH: "0060-headless-runtime",
          INTERLOCK_NODE: "line-fits-real-codex",
        });
        launch.value.cleanup(true);
      } finally {
        await reapRegisteredGuardLaunches();
        await provider.close();
      }
    },
  );
});
