import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  PROBE_REAL_CHECKS_CAPABILITY,
  RUNTIMES_V2_CAPABILITY,
} from "runner";
import { buildRegistry, validatorFor } from "schemas";
import { afterEach, describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;
let originalCwd: string | undefined;
let originalHome: string | undefined;

afterEach(() => {
  if (originalCwd !== undefined) process.chdir(originalCwd);
  if (originalHome === undefined) delete process.env["HOME"];
  else process.env["HOME"] = originalHome;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
  originalCwd = undefined;
  originalHome = undefined;
});

function isolatedDirectory(): void {
  directory = mkdtempSync(join(runsRoot, "capabilities-"));
  originalCwd = process.cwd();
  originalHome = process.env["HOME"];
  process.chdir(directory);
  process.env["HOME"] = directory;
}

const expectedCapabilities = [
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  PROBE_REAL_CHECKS_CAPABILITY,
  RUNTIMES_V2_CAPABILITY,
];

describe("interlock capabilities", () => {
  it("prints a schema-valid JSON envelope without an interlock repository", async () => {
    isolatedDirectory();

    const result = await run(["capabilities", "--json"]);

    expect(result).toEqual({
      exitCode: 0,
      message: JSON.stringify({
        interlock: "capabilities@v0",
        capabilities: expectedCapabilities,
      }),
    });
    const validate = validatorFor(buildRegistry(), "capabilities@v0");
    expect(validate).toBeDefined();
    if (validate === undefined) throw new Error("capabilities@v0 schema is unavailable");
    const value: unknown = JSON.parse(result.message);
    expect(validate(value)).toBe(true);
    expect(value).toEqual({
      interlock: "capabilities@v0",
      capabilities: expectedCapabilities,
    });
  });

  it("prints the same owned ids one per line in plain form", async () => {
    isolatedDirectory();

    const result = await run(["capabilities"]);

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(expectedCapabilities.join("\n"));
  });
});
