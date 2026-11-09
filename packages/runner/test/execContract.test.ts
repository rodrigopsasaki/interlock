import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isErr, isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  execRuntimeArgv,
  explainRuntimeCatalogueRefusal,
  loadRuntimeCatalogue,
  mergeRuntimes,
  type ResolvedRuntime,
} from "../src/runtimeCatalogue.ts";
import { prepareLaunch } from "../src/sessionDrive.ts";
import { expandWritableRootArgs } from "../src/writableRootArgs.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function catalogue(fields: readonly string[]): string {
  return [
    "interlock: runtimes@v2",
    "runtimes:",
    "  fixture:",
    "    kind: exec",
    "    args:",
    "      - fixture-agent",
    "      - --prompt",
    '      - "{prompt}"',
    "    model: fixture",
    ...fields.map((field) => `    ${field.replace(/^ {4}/, "")}`),
    "",
  ].join("\n");
}

async function loaded(fields: readonly string[]): Promise<ResolvedRuntime> {
  directory = mkdtempSync(join(runsRoot, "exec-contract-"));
  const path = join(directory, "runtimes.yaml");
  writeFileSync(path, catalogue(fields));
  const result = await loadRuntimeCatalogue(path);
  if (isErr(result)) throw new Error(explainRuntimeCatalogueRefusal(result.error));
  const merged = mergeRuntimes(result.value, undefined);
  if (isErr(merged)) throw new Error(JSON.stringify(merged.error));
  const runtime = merged.value.runtimes.get("fixture");
  if (runtime === undefined) throw new Error("fixture runtime was not loaded");
  return runtime;
}

describe("exec launch contract", () => {
  it("expands writable roots only at the opt-in placeholder", async () => {
    const runtime = await loaded(['    writable_root_args: ["--root", "{path}"]']);
    const withPlaceholder: ResolvedRuntime = {
      ...runtime,
      args: ["fixture-agent", "{writable_roots}", "--prompt", "{prompt}"],
    };
    const argv = execRuntimeArgv(withPlaceholder, "prompt", false, {
      writableRoots: ["common git", "worktree git"],
    });
    expect(argv).toEqual([
      "fixture-agent",
      "--root",
      "common git",
      "--root",
      "worktree git",
      "--prompt",
      "prompt",
    ]);
    expect(execRuntimeArgv(runtime, "prompt", false, { writableRoots: ["ignored"] })).toEqual([
      "fixture-agent",
      "--prompt",
      "prompt",
    ]);
  });

  it.each([
    { allow: [], expected: ["--disable-all"] },
    {
      allow: ["one", "two"],
      expected: ["--disable-all", "--allow", "one", "--allow", "two"],
    },
    { allow: ["two"], expected: ["--disable-all", "--allow", "two"] },
  ])("expands exclusive MCP policy for $allow", async ({ allow, expected }) => {
    const runtime = await loaded([
      "    mcp_servers: [one, two, ambient]",
      `    mcp_allow: [${allow.join(", ")}]`,
      "    mcp_exclusive:",
      "      disable_all: [--disable-all]",
      '      allow_each: ["--allow", "{name}"]',
    ]);
    const argv = execRuntimeArgv(runtime, "prompt");
    expect(argv).toEqual(["fixture-agent", "--prompt", "prompt", ...expected]);
    expect(argv.filter((argument) => argument === "--disable-all")).toHaveLength(1);
    expect(argv).not.toContain("ambient");
    for (const server of allow) expect(argv).toContain(server);
  });

  it("forwards names without copying values or inventing unset variables", async () => {
    const runtime = await loaded([
      "    environment_passthrough: [KEEP_NAME, UNSET_NAME]",
      '    environment_forward_args: ["--forward", "{name}"]',
    ]);
    expect(
      execRuntimeArgv(runtime, "prompt", false, {
        environment: { KEEP_NAME: "secret", UNLISTED_NAME: "hidden" },
      }),
    ).toEqual(["fixture-agent", "--prompt", "prompt", "--forward", "KEEP_NAME"]);
  });

  it("prepares an exec launch with the same effective argv and environment contract", async () => {
    const runtime = await loaded([
      '    writable_root_args: ["--root", "{path}"]',
      "    mcp_servers: [one]",
      "    mcp_exclusive:",
      "      disable_all: [--disable-all]",
      '      allow_each: ["--allow", "{name}"]',
      "    environment_passthrough: [KEEP_NAME]",
      '    environment_forward_args: ["--forward", "{name}"]',
    ]);
    const launch = prepareLaunch(runtime, ".", { KEEP_NAME: "secret" }, { prompt: "prompt" });
    expect(isOk(launch)).toBe(true);
    if (isOk(launch)) {
      expect(launch.value.program).toBe("fixture-agent");
      expect(launch.value.environment).toEqual({ KEEP_NAME: "secret" });
      expect(launch.value.args).toEqual([
        "--prompt",
        "prompt",
        "--disable-all",
        "--allow",
        "one",
        "--forward",
        "KEEP_NAME",
      ]);
    }
  });

  it("forwards a listed variable to a shell while excluding an unlisted variable", async () => {
    const visibleName = "EXEC_CONTRACT_VISIBLE";
    const unlistedName = "EXEC_CONTRACT_UNLISTED";
    const previousVisible = process.env[visibleName];
    const previousUnlisted = process.env[unlistedName];
    process.env[visibleName] = "visible-value";
    process.env[unlistedName] = "hidden-value";
    try {
      const loadedRuntime = await loaded([
        `    environment_passthrough: [${visibleName}]`,
        '    environment_forward_args: ["--forward", "{name}"]',
      ]);
      const testDirectory = directory;
      if (testDirectory === undefined) throw new Error("fixture directory was not created");
      const fixturePath = join(testDirectory, "filtered-shell.mjs");
      const outputPath = join(testDirectory, "filtered-shell-output.json");
      writeFileSync(
        fixturePath,
        [
          'import { spawn } from "node:child_process";',
          'import { writeFileSync } from "node:fs";',
          "const outputPath = process.argv[2];",
          'const forwarded = new Set(process.argv.flatMap((argument, index, args) => argument === "--forward" && args[index + 1] !== undefined ? [args[index + 1]] : []));',
          "const environment = Object.fromEntries([...forwarded].flatMap((name) => { const value = process.env[name]; return value === undefined ? [] : [[name, value]]; }));",
          'const child = spawn("/bin/sh", ["-c", "env"], { env: environment });',
          'let output = "";',
          'child.stdout.on("data", (chunk) => { output += chunk; });',
          'child.on("close", (code) => { writeFileSync(outputPath, JSON.stringify({ code, output })); process.exit(code ?? 1); });',
        ].join("\n"),
      );
      const runtime: ResolvedRuntime = {
        ...loadedRuntime,
        args: [process.execPath, fixturePath, outputPath, "{prompt}"],
      };
      const launch = prepareLaunch(
        runtime,
        testDirectory,
        {},
        {
          prompt: "prompt",
          forwardEnvironment: process.env,
        },
      );
      expect(isOk(launch)).toBe(true);
      if (!isOk(launch)) return;
      const child = spawn(process.execPath, launch.value.args, {
        cwd: testDirectory,
        env: { ...process.env, ...launch.value.environment },
      });
      const exitCode = await new Promise<number>((resolve, reject) => {
        child.on("error", reject);
        child.on("close", (code) => resolve(code ?? 1));
      });
      expect(exitCode).toBe(0);
      const shellResult = readFileSync(outputPath, "utf8");
      expect(shellResult).toContain(`${visibleName}=visible-value`);
      expect(shellResult).not.toContain(unlistedName);
    } finally {
      if (previousVisible === undefined) delete process.env[visibleName];
      else process.env[visibleName] = previousVisible;
      if (previousUnlisted === undefined) delete process.env[unlistedName];
      else process.env[unlistedName] = previousUnlisted;
    }
  });

  it("refuses exclusive MCP combined with the legacy disable template", async () => {
    const result = await loadRuntimeCatalogue(
      (() => {
        directory = mkdtempSync(join(runsRoot, "exec-contract-invalid-"));
        const path = join(directory, "runtimes.yaml");
        writeFileSync(
          path,
          catalogue([
            '    mcp_disable_args: [--disable, "{name}"]',
            "    mcp_exclusive:",
            "      disable_all: [--disable-all]",
            '      allow_each: ["--allow", "{name}"]',
          ]),
        );
        return path;
      })(),
    );
    expect(isErr(result)).toBe(true);
  });

  it("refuses environment passthrough of an interlock marker", async () => {
    const result = await loadRuntimeCatalogue(
      (() => {
        directory = mkdtempSync(join(runsRoot, "exec-contract-invalid-"));
        const path = join(directory, "runtimes.yaml");
        writeFileSync(path, catalogue(["    environment_passthrough: [INTERLOCK_SESSION]"]));
        return path;
      })(),
    );
    expect(isErr(result)).toBe(true);
  });

  it("keeps the existing argv byte for byte when no opt-in fields are written", async () => {
    const runtime = await loaded(['    writable_root_args: ["--root", "{path}"]']);
    expect(execRuntimeArgv(runtime, "prompt")).toEqual(["fixture-agent", "--prompt", "prompt"]);
    expect(expandWritableRootArgs({ before: ["--root"], after: [] }, "ignored")).toEqual([
      "--root",
      "ignored",
    ]);
  });
});
