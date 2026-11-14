import { execFileSync, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, unlinkSync, writeFileSync } from "node:fs";
import { loadavg } from "node:os";
import { dirname } from "node:path";

export interface BusyPrefixOptions {
  readonly argv: readonly string[];
  readonly environment?: NodeJS.ProcessEnv;
  readonly readLoad?: () => number;
  readonly processPresent?: (name: string) => boolean;
  readonly sleep?: (ms: number) => void;
}

const reportName = "INTERLOCK_BUSY_REPORT";
const loadCeilingName = "INTERLOCK_BUSY_LOAD_CEILING";
const lockPathName = "INTERLOCK_BUSY_LOCK_PATH";
const lockWaitName = "INTERLOCK_BUSY_LOCK_WAIT_MS";
const processName = "INTERLOCK_BUSY_PROCESS";

function firstNumber(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function report(environment: NodeJS.ProcessEnv, reason: string): number {
  const path = environment[reportName];
  if (path !== undefined && path.length > 0) writeFileSync(path, `${reason}\n`, { mode: 0o600 });
  return 75;
}

function defaultProcessPresent(name: string): boolean {
  try {
    execFileSync("pgrep", ["-f", name], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function takeLock(path: string, waitMs: number, sleep: (ms: number) => void): number | undefined {
  const started = Date.now();
  mkdirSync(dirname(path), { recursive: true });
  while (Date.now() - started <= waitMs) {
    try {
      return openSync(path, "wx", 0o600);
    } catch {
      sleep(10);
    }
  }
  return undefined;
}

export function runBusyPrefix(options: BusyPrefixOptions): number {
  const environment = { ...process.env, ...(options.environment ?? {}) };
  const readLoad = options.readLoad ?? (() => loadavg()[0] ?? 0);
  const processPresent = options.processPresent ?? defaultProcessPresent;
  const sleep =
    options.sleep ??
    ((ms: number) => {
      const until = Date.now() + ms;
      while (Date.now() < until) {}
    });
  const ceiling = environment[loadCeilingName];
  if (ceiling !== undefined && readLoad() > firstNumber(ceiling, Number.POSITIVE_INFINITY)) {
    return report(environment, `load ${readLoad()} exceeds ceiling ${ceiling}`);
  }
  const processTarget = environment[processName];
  if (processTarget !== undefined && !processPresent(processTarget)) {
    return report(environment, `process absent: ${processTarget}`);
  }
  const lock = environment[lockPathName];
  const handle =
    lock === undefined
      ? undefined
      : takeLock(lock, firstNumber(environment[lockWaitName], 1_000), sleep);
  if (lock !== undefined && handle === undefined) {
    return report(environment, `lock not taken: ${lock}`);
  }
  const child = spawnSync(options.argv[0] ?? "", options.argv.slice(1), {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  });
  if (handle !== undefined) {
    closeSync(handle);
    if (lock !== undefined && existsSync(lock)) unlinkSync(lock);
  }
  return child.status ?? 1;
}

if (import.meta.main) process.exit(runBusyPrefix({ argv: process.argv.slice(2) }));
