import { access, chmod, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { ms } from "@phyxiusjs/clock";
import type { BusyPolicy } from "./machineProvider.ts";

export const BUSY_REPORT_ENV = "INTERLOCK_BUSY_REPORT";
export const GATE_START_ENV = "INTERLOCK_GATE_START";

export interface BusyProcessResult {
  readonly exitCode: number;
}

export type BusyBoundaryResult<T> =
  | { readonly kind: "started"; readonly result: T }
  | { readonly kind: "ordinary"; readonly result: T }
  | { readonly kind: "busy"; readonly result: T; readonly reason: string };

export interface BusyBoundaryRequest<T> {
  readonly worktree: string;
  readonly heavy: readonly string[];
  readonly command: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly run: (argv: readonly string[], cwd: string, env: NodeJS.ProcessEnv) => Promise<T>;
  readonly processResult: (result: T) => BusyProcessResult | undefined;
}

export const BUSY_START_SCRIPT = [
  `printf '%s\\n' started > "$${GATE_START_ENV}"`,
  `unset ${GATE_START_ENV} ${BUSY_REPORT_ENV}`,
  'exec "$@"',
].join("\n");

function boundaryArgv(heavy: readonly string[], command: readonly string[]): readonly string[] {
  return [
    ...heavy,
    "/bin/sh",
    "-c",
    BUSY_START_SCRIPT,
    "interlock-gate-start",
    "mise",
    "exec",
    "--",
    ...command,
  ];
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function reasonIn(path: string): Promise<string | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return undefined;
  }
  const lines = raw.trimEnd().split(/\r?\n/);
  if (lines.length !== 1) return undefined;
  const reason = lines[0]?.trim();
  return reason === undefined || reason.length === 0 ? undefined : reason;
}

export async function runBusyBoundary<T>(
  request: BusyBoundaryRequest<T>,
  policy: BusyPolicy,
): Promise<BusyBoundaryResult<T>> {
  const directory = await mkdtemp(join(request.worktree, ".interlock-gate-"));
  await chmod(directory, 0o700);
  const startPath = join(directory, "start");
  const reportPath = join(directory, "busy-report");
  const env: NodeJS.ProcessEnv = {
    ...request.env,
    [GATE_START_ENV]: startPath,
    [BUSY_REPORT_ENV]: reportPath,
  };
  try {
    const result = await request.run(
      boundaryArgv(request.heavy, request.command),
      request.worktree,
      env,
    );
    const processResult = request.processResult(result);
    if (await exists(startPath)) return { kind: "started", result };
    if (processResult?.exitCode !== policy.exitCode) return { kind: "ordinary", result };
    const reason = await reasonIn(reportPath);
    return reason === undefined ? { kind: "ordinary", result } : { kind: "busy", result, reason };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export function busyBackoff(policy: BusyPolicy, refusalNumber: number): number {
  return Math.min(policy.firstBackoffMs * 2 ** (refusalNumber - 1), policy.maxBackoffMs);
}

export function busySleep(policy: BusyPolicy, refusalNumber: number): ReturnType<typeof ms> {
  return ms(busyBackoff(policy, refusalNumber));
}
