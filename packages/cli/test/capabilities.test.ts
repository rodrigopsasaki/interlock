import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as face from "face";
import * as ledger from "ledger";
import * as runner from "runner";
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
import { afterEach, describe, expect, it, vi } from "vitest";
import { run } from "../src/main.ts";

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
  directory = mkdtempSync(join(tmpdir(), "interlock-capabilities-"));
  originalCwd = process.cwd();
  originalHome = process.env["HOME"];
  process.chdir(directory);
  process.env["HOME"] = directory;
}

const literalCapabilities: readonly string[] = [
  "exec.pane-independent",
  "exec.writable-roots-slot",
  "exec.mcp-exclusive",
  "exec.environment-passthrough",
  "exec.headless-args-probe",
  "probe.real-checks",
  "runtimes@v2",
];

const exportedCapabilities: readonly string[] = [
  EXEC_PANE_INDEPENDENT_CAPABILITY,
  EXEC_WRITABLE_ROOTS_SLOT_CAPABILITY,
  EXEC_MCP_EXCLUSIVE_CAPABILITY,
  EXEC_ENVIRONMENT_PASSTHROUGH_CAPABILITY,
  EXEC_HEADLESS_ARGS_PROBE_CAPABILITY,
  PROBE_REAL_CHECKS_CAPABILITY,
  RUNTIMES_V2_CAPABILITY,
];

describe("interlock capabilities", () => {
  it("keeps the exported ids equal to the literal public contract", () => {
    expect(exportedCapabilities).toEqual(literalCapabilities);
  });

  it("prints a schema-valid JSON envelope without an interlock repository", async () => {
    isolatedDirectory();

    const result = await run(["capabilities", "--json"]);

    expect(result).toEqual({
      exitCode: 0,
      message: JSON.stringify({
        interlock: "capabilities@v0",
        capabilities: literalCapabilities,
      }),
    });
    const validate = validatorFor(buildRegistry(), "capabilities@v0");
    expect(validate).toBeDefined();
    if (validate === undefined) throw new Error("capabilities@v0 schema is unavailable");
    const value: unknown = JSON.parse(result.message);
    expect(validate(value)).toBe(true);
    expect(value).toEqual({
      interlock: "capabilities@v0",
      capabilities: literalCapabilities,
    });
  });

  it("prints the same owned ids one per line in plain form", async () => {
    isolatedDirectory();

    const result = await run(["capabilities"]);

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(literalCapabilities.join("\n"));
  });

  it("does not call machine-facing readers for JSON capabilities", async () => {
    isolatedDirectory();
    const readers = [
      vi.spyOn(runner, "loadRuntimeCatalogue"),
      vi.spyOn(face, "sharedJournalDirectory"),
      vi.spyOn(ledger, "createLedger"),
      vi.spyOn(runner, "resolveMachine"),
      vi.spyOn(runner, "createHerdrRuntime"),
    ];

    const result = await run(["capabilities", "--json"]);

    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      JSON.stringify({ interlock: "capabilities@v0", capabilities: literalCapabilities }),
    );
    for (const reader of readers) expect(reader).not.toHaveBeenCalled();
  });
});
