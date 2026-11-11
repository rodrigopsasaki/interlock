import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { afterAll, afterEach } from "vitest";
import {
  cleanupCodexLaunches,
  cleanupCodexLaunchesSync,
  platformProcessTable,
} from "./codexSupervisor.ts";

const runsRoot = join(import.meta.dirname, "..");
mkdirSync(join(runsRoot, ".runs"), { recursive: true });
const guardDirectory = mkdtempSync(join(join(runsRoot, ".runs"), "codex-guard-"));
const registry = join(guardDirectory, "launches.jsonl");
const originalPath = process.env["PATH"] ?? "";
const guardSource = join(import.meta.dirname, "codexGuard.ts");
const wrapper = join(guardDirectory, "codex");

writeFileSync(
  wrapper,
  `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} --experimental-strip-types ${JSON.stringify(guardSource)} "$@"\n`,
  { mode: 0o700 },
);
chmodSync(wrapper, 0o700);
process.env["INTERLOCK_CODEX_GUARD_DIR"] = guardDirectory;
process.env["INTERLOCK_CODEX_GUARD_REGISTRY"] = registry;
process.env["PATH"] = `${guardDirectory}${delimiter}${originalPath}`;

afterEach(async () => {
  const survivors = await cleanupCodexLaunches(registry, platformProcessTable());
  if (survivors.length > 0) {
    throw new Error(`Codex launch survivors: ${survivors.map((pid) => String(pid)).join(", ")}`);
  }
});

process.once("exit", () => cleanupCodexLaunchesSync(registry, platformProcessTable()));

afterAll(() => {
  process.env["PATH"] = originalPath;
  delete process.env["INTERLOCK_CODEX_GUARD_DIR"];
  delete process.env["INTERLOCK_CODEX_GUARD_REGISTRY"];
  rmSync(guardDirectory, { recursive: true, force: true });
});
