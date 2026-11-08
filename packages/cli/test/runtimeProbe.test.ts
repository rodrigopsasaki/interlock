import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runRuntimeProbe } from "../src/runtime/probe.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

describe("runtime probe command", () => {
  it("refuses an empty catalogue without succeeding vacuously", async () => {
    const directory = mkdtempSync(join(runsRoot, "runtime-probe-"));
    const previous = process.env["INTERLOCK_RUNTIMES"];
    try {
      mkdirSync(join(directory, ".interlock"), { recursive: true });
      gitInitFixture(directory);
      process.env["INTERLOCK_RUNTIMES"] = join(directory, "missing-runtimes.yaml");
      const result = await runRuntimeProbe(["--all"], {
        cwd: directory,
        machine: { provider: "none", env: {}, heavy: [] },
      });

      expect(result.exitCode).toBe(1);
      expect(result.message).toContain("empty catalogue");
    } finally {
      if (previous === undefined) delete process.env["INTERLOCK_RUNTIMES"];
      else process.env["INTERLOCK_RUNTIMES"] = previous;
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
