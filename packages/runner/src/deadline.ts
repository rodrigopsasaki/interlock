import { parse as parseYaml } from "yaml";
import type { GateCommandResult, GateCommandRunner } from "./gateJudge.ts";
import { runOwnedCommandWithTimeout } from "./ownedCommand.ts";

export const DEFAULT_JUDGE_TIMEOUT_MINUTES = 45;
export const JUDGE_TERM_GRACE_MS = 10_000;
export const LEASE_REPORT_INTERVAL_MS = 60_000;

export interface JudgeDeadline {
  readonly minutes: number;
  readonly startedAtMs: number;
  remainingMs(): number;
  expired(): boolean;
}

export interface HeldLease {
  readonly session: string;
  readonly since: string;
}

export class JudgeDeadlineExceeded extends Error {
  readonly gateId: string;

  constructor(gateId: string) {
    super(`judge deadline reached on gate ${gateId}`);
    this.name = "JudgeDeadlineExceeded";
    this.gateId = gateId;
  }
}

interface RecordValue {
  readonly [key: string]: unknown;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveMinutes(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function timeoutFromGraph(graphText: string): number | undefined {
  const parsed: unknown = parseYaml(graphText);
  if (!isRecord(parsed)) return undefined;
  return positiveMinutes(parsed["judge_timeout_minutes"]);
}

export type JudgeTimeoutResolution =
  | { readonly kind: "resolved"; readonly minutes: number }
  | { readonly kind: "refused"; readonly message: string };

export function resolveJudgeTimeout(
  args: readonly string[],
  graphText: string,
): JudgeTimeoutResolution {
  const flag = args.find(
    (argument) => argument === "--timeout" || argument.startsWith("--timeout="),
  );
  if (flag !== undefined) {
    const raw =
      flag === "--timeout" ? args[args.indexOf(flag) + 1] : flag.slice("--timeout=".length);
    const minutes = raw === undefined ? undefined : positiveMinutes(Number(raw));
    return minutes === undefined
      ? { kind: "refused", message: "--timeout must be a positive number of minutes." }
      : { kind: "resolved", minutes };
  }

  try {
    const minutes = timeoutFromGraph(graphText);
    return { kind: "resolved", minutes: minutes ?? DEFAULT_JUDGE_TIMEOUT_MINUTES };
  } catch {
    return {
      kind: "refused",
      message: "judge_timeout_minutes must be a positive number of minutes.",
    };
  }
}

export function createJudgeDeadline(minutes: number, now: () => number = Date.now): JudgeDeadline {
  const startedAtMs = now();
  const timeoutMs = minutes * 60_000;
  return {
    minutes,
    startedAtMs,
    remainingMs: () => Math.max(0, startedAtMs + timeoutMs - now()),
    expired: () => now() >= startedAtMs + timeoutMs,
  };
}

function gateResultOf(
  result: Awaited<ReturnType<typeof runOwnedCommandWithTimeout>>,
): GateCommandResult {
  return {
    exitCode: result.code,
    output: result.output.toString("utf8"),
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

export function commandRunnerWithDeadline(
  deadline: JudgeDeadline,
  gateIds: readonly string[],
  commandRunner?: GateCommandRunner,
): GateCommandRunner {
  let commandIndex = 0;
  return async (argv, cwd, env) => {
    const gateId = gateIds[commandIndex] ?? "unknown";
    commandIndex += 1;
    const remainingMs = deadline.remainingMs();
    if (remainingMs <= 0) throw new JudgeDeadlineExceeded(gateId);

    if (commandRunner !== undefined) {
      const result = await commandRunner(argv, cwd, env);
      if (deadline.expired()) throw new JudgeDeadlineExceeded(gateId);
      return result;
    }

    const result = await runOwnedCommandWithTimeout(
      argv,
      cwd,
      env,
      remainingMs,
      JUDGE_TERM_GRACE_MS,
    );
    if (result.timedOut || deadline.expired()) throw new JudgeDeadlineExceeded(gateId);
    return gateResultOf(result);
  };
}

export async function waitForHeldLease(
  deadline: JudgeDeadline,
  readLease: () => Promise<HeldLease | undefined>,
  narrate: (line: string) => void,
  sleep: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<"released" | "deadline"> {
  while (!deadline.expired()) {
    await sleep(Math.min(LEASE_REPORT_INTERVAL_MS, deadline.remainingMs()));
    if (deadline.expired()) return "deadline";
    const lease = await readLease();
    if (lease === undefined) return "released";
    narrate(`judge waiting: lease held by session ${lease.session} since ${lease.since}`);
  }
  return "deadline";
}

export function deadlineMessage(minutes: number, gateId: string): string {
  return `gave up after ${minutes} minutes on gate ${gateId}`;
}

export function leaseDeadlineMessage(minutes: number): string {
  return `gave up after ${minutes} minutes waiting on a held lease`;
}
