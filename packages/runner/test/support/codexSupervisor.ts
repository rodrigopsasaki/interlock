import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

export interface ProcessRecord {
  readonly pid: number;
  readonly ppid: number;
  readonly pgid: number;
  readonly startTime: string;
  readonly command: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly state: "running" | "zombie" | "unknown";
}

export interface ProcessTable {
  readonly list: () => readonly ProcessRecord[];
  readonly now?: () => string | undefined;
}

export interface LaunchRecord {
  readonly pid: number;
  readonly pgid: number;
  readonly startTime: string;
  readonly token: string;
}

interface RegisteredLaunch extends LaunchRecord {
  readonly registry: string;
}

export interface LaunchRegistration {
  readonly pid: number;
  readonly token: string;
}

type Signal = (pid: number, signal: NodeJS.Signals) => void;

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || !/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEnvironment(value: string): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  const parts = value.includes("\u0000") ? value.split("\u0000") : value.split(/\s+/);
  for (const part of parts) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    environment[part.slice(0, separator)] = part.slice(separator + 1);
  }
  return environment;
}

function linuxProcessTable(): ProcessTable {
  return {
    now: () => {
      try {
        const uptime = Number(readFileSync("/proc/uptime", "utf8").split(/\s+/)[0]);
        const ticks = Number(
          execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }).trim(),
        );
        return Number.isFinite(uptime) && Number.isFinite(ticks)
          ? String(Math.floor(uptime * ticks))
          : undefined;
      } catch {
        return undefined;
      }
    },
    list: () => {
      const records: ProcessRecord[] = [];
      for (const entry of readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = parseNumber(entry);
        if (pid === undefined) continue;
        try {
          const stat = readFileSync(`/proc/${entry}/stat`, "utf8");
          const closing = stat.lastIndexOf(")");
          if (closing < 0) continue;
          const fields = stat.slice(closing + 2).split(" ");
          const ppid = parseNumber(fields[1]);
          const pgid = parseNumber(fields[2]);
          const startTime = fields[19];
          if (ppid === undefined || pgid === undefined || startTime === undefined) continue;
          const command = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\u0000", " ");
          const environment = parseEnvironment(readFileSync(`/proc/${entry}/environ`, "utf8"));
          records.push({
            pid,
            ppid,
            pgid,
            startTime,
            command,
            environment,
            state: fields[0] === "Z" ? "zombie" : "running",
          });
        } catch {}
      }
      return records;
    },
  };
}

function macProcessTable(): ProcessTable {
  return {
    now: () => new Date().toString(),
    list: () => {
      let output = "";
      try {
        output = execFileSync("ps", ["eww", "-axo", "pid=,ppid=,pgid=,lstart=,command="], {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
        });
      } catch {
        return [];
      }
      const records: ProcessRecord[] = [];
      for (const line of output.split(/\r?\n/)) {
        const fields = line.trim().split(/\s+/);
        const pid = parseNumber(fields[0]);
        const ppid = parseNumber(fields[1]);
        const pgid = parseNumber(fields[2]);
        if (pid === undefined || ppid === undefined || pgid === undefined || fields.length < 9) {
          continue;
        }
        const startTime = fields.slice(3, 8).join(" ");
        const command = fields.slice(8).join(" ");
        records.push({
          pid,
          ppid,
          pgid,
          startTime,
          command,
          environment: parseEnvironment(command),
          state: "running",
        });
      }
      return records;
    },
  };
}

export function platformProcessTable(): ProcessTable {
  return existsSync("/proc") ? linuxProcessTable() : macProcessTable();
}

function readLaunches(registry: string): readonly RegisteredLaunch[] {
  if (!existsSync(registry)) return [];
  const launches: RegisteredLaunch[] = [];
  let text = "";
  try {
    text = readFileSync(registry, "utf8");
  } catch {
    return [];
  }
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) continue;
      const record = parsed;
      const pid = typeof record["pid"] === "number" ? record["pid"] : undefined;
      const pgid = typeof record["pgid"] === "number" ? record["pgid"] : undefined;
      const startTime = typeof record["startTime"] === "string" ? record["startTime"] : undefined;
      const token = typeof record["token"] === "string" ? record["token"] : undefined;
      if (
        pid === undefined ||
        pgid === undefined ||
        startTime === undefined ||
        token === undefined
      ) {
        continue;
      }
      launches.push({ pid, pgid, startTime, token, registry });
    } catch {}
  }
  return launches;
}

export function registeredLaunches(registry: string): readonly LaunchRecord[] {
  return readLaunches(registry);
}

export function registerLaunch(
  registry: string,
  pid: number,
  pgid: number,
  startTime: string,
  token: string = randomUUID(),
): LaunchRegistration {
  appendFileSync(registry, `${JSON.stringify({ pid, pgid, startTime, token })}\n`, { mode: 0o600 });
  return { pid, token };
}

function isLaunchProcess(
  process: ProcessRecord,
  launch: RegisteredLaunch,
  leaderStartMatches: boolean,
  leaderMissing: boolean,
  observedAt: string | undefined,
): boolean {
  if (process.state === "zombie") return false;
  const tokenMatch = process.environment["INTERLOCK_CODEX_LAUNCH_TOKEN"] === launch.token;
  const groupMatch = process.pgid === launch.pgid;
  if (!tokenMatch && !groupMatch) return false;
  if (process.pid === launch.pid) return process.startTime === launch.startTime;
  if (tokenMatch) return true;
  if (!leaderStartMatches || !groupMatch) return false;
  if (!leaderMissing) return true;
  if (observedAt === undefined) return false;
  const processStart = comparableStartTime(process.startTime);
  const launchStart = comparableStartTime(launch.startTime);
  const cleanupStart = comparableStartTime(observedAt);
  return (
    processStart !== undefined &&
    launchStart !== undefined &&
    cleanupStart !== undefined &&
    processStart > launchStart &&
    processStart <= cleanupStart
  );
}

function comparableStartTime(value: string): number | undefined {
  if (/^\d+$/.test(value)) return Number(value);
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function survivors(
  table: ProcessTable,
  launches: readonly RegisteredLaunch[],
  observedAt: string | undefined = table.now?.(),
): readonly ProcessRecord[] {
  const current = table.list();
  return current.filter((process) =>
    launches.some((launch) => {
      const leader = current.find((candidate) => candidate.pid === launch.pid);
      const leaderMissing = leader === undefined;
      const leaderStartMatches = leaderMissing || leader.startTime === launch.startTime;
      return isLaunchProcess(process, launch, leaderStartMatches, leaderMissing, observedAt);
    }),
  );
}

function signalSurvivors(processes: readonly ProcessRecord[], signal: Signal): void {
  for (const process of processes) {
    try {
      signal(process.pid, "SIGTERM");
    } catch {}
  }
}

export async function cleanupCodexLaunches(
  registry: string,
  table: ProcessTable = platformProcessTable(),
  signal: Signal = (pid, value) => process.kill(pid, value),
  graceMs = 750,
): Promise<readonly number[]> {
  const launches = readLaunches(registry);
  if (launches.length === 0) return [];
  const observedAt = table.now?.();
  const observed = survivors(table, launches, observedAt);
  signalSurvivors(observed, signal);
  const deadline = Date.now() + graceMs;
  let remaining = survivors(table, launches, observedAt);
  while (remaining.length > 0 && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    remaining = survivors(table, launches, observedAt);
  }
  const observedPids = observed.map((process) => process.pid);
  if (remaining.length > 0) {
    for (const process of remaining) {
      try {
        signal(process.pid, "SIGKILL");
      } catch {}
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    remaining = survivors(table, launches, observedAt);
  }
  writeFileSync(registry, "", { mode: 0o600 });
  return observedPids;
}

export function cleanupCodexLaunchesSync(
  registry: string,
  table: ProcessTable = platformProcessTable(),
  signal: Signal = (pid, value) => process.kill(pid, value),
): readonly number[] {
  const launches = readLaunches(registry);
  if (launches.length === 0) return [];
  const observedAt = table.now?.();
  const observed = survivors(table, launches, observedAt);
  signalSurvivors(observed, signal);
  for (const process of survivors(table, launches, observedAt)) {
    try {
      signal(process.pid, "SIGKILL");
    } catch {}
  }
  try {
    writeFileSync(registry, "", { mode: 0o600 });
  } catch {
    return observed.map((process) => process.pid);
  }
  return observed.map((process) => process.pid);
}

export function launchToken(): string {
  return randomUUID();
}
