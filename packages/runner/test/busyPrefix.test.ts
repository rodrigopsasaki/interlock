import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runBusyPrefix } from "../../../scripts/machine/busy-prefix.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture(): string {
  const runs = join(import.meta.dirname, ".runs");
  mkdirSync(runs, { recursive: true });
  const root = mkdtempSync(join(runs, "busy-prefix-"));
  roots.push(root);
  return root;
}

function reportAt(root: string): string {
  return join(root, "busy-report");
}

describe("busy prefix", () => {
  it("refuses a load ceiling through the injected load reader", () => {
    const root = fixture();
    const report = reportAt(root);
    const result = runBusyPrefix({
      argv: [process.execPath, "-e", "process.exit(0)"],
      environment: { INTERLOCK_BUSY_REPORT: report, INTERLOCK_BUSY_LOAD_CEILING: "1" },
      readLoad: () => 2,
    });
    expect(result).toBe(75);
    expect(existsSync(report)).toBe(true);
  });

  it("refuses a lock it cannot take within its bound", () => {
    const root = fixture();
    const lock = join(root, "lock");
    writeFileSync(lock, "held\n");
    const report = reportAt(root);
    const result = runBusyPrefix({
      argv: [process.execPath, "-e", "process.exit(0)"],
      environment: {
        INTERLOCK_BUSY_REPORT: report,
        INTERLOCK_BUSY_LOCK_PATH: lock,
        INTERLOCK_BUSY_LOCK_WAIT_MS: "0",
      },
      sleep: () => undefined,
    });
    expect(result).toBe(75);
  });

  it("refuses an absent named process and runs the start command when admitted", () => {
    const root = fixture();
    const report = reportAt(root);
    const admitted = join(root, "admitted");
    const absent = runBusyPrefix({
      argv: [process.execPath, "-e", "process.exit(0)"],
      environment: { INTERLOCK_BUSY_REPORT: report, INTERLOCK_BUSY_PROCESS: "missing" },
      processPresent: () => false,
    });
    expect(absent).toBe(75);
    const result = runBusyPrefix({
      argv: [
        process.execPath,
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(admitted)}, 'yes')`,
      ],
      environment: { INTERLOCK_BUSY_REPORT: report },
      processPresent: () => true,
    });
    expect(result).toBe(0);
    expect(existsSync(admitted)).toBe(true);
  });
});
