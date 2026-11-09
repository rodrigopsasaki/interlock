import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
      "    mcp_servers: [one, two]",
      `    mcp_allow: [${allow.join(", ")}]`,
      "    mcp_exclusive:",
      "      disable_all: [--disable-all]",
      '      allow_each: ["--allow", "{name}"]',
    ]);
    expect(execRuntimeArgv(runtime, "prompt")).toEqual([
      "fixture-agent",
      "--prompt",
      "prompt",
      ...expected,
    ]);
    expect(execRuntimeArgv(runtime, "prompt")).not.toContain("ambient");
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
