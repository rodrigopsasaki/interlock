import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SessionFacts, SessionQuota, SessionUsage } from "ledger";
import { sessionFacts } from "ledger";
import type { AgentIdentity, SessionFactsReader } from "../runtime.ts";
import { isRecord, isString, prop } from "../validate.ts";

const OPENING_PROMPT_PREFIX = "This is an interlock session for node ";

export function codexHome(): string {
  return process.env["CODEX_HOME"] ?? join(homedir(), ".codex");
}

export async function findCodexSessionPath(
  sessionId: string,
  home: string = codexHome(),
): Promise<string | undefined> {
  const sessions = join(home, "sessions");
  const visit = async (directory: string): Promise<string | undefined> => {
    let entries: readonly Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return undefined;
    }
    for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = await visit(path);
        if (found !== undefined) return found;
      } else if (
        entry.isFile() &&
        (entry.name === `${sessionId}.jsonl` || entry.name.endsWith(`-${sessionId}.jsonl`))
      ) {
        return path;
      }
    }
    return undefined;
  };
  return visit(sessions);
}

function recordFacts(): SessionFacts {
  return { ...sessionFacts.unknown(), deliveryBasis: "record" };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRfc3339(value: unknown): value is string {
  return (
    isString(value) &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseLine(line: string): Record<string, unknown> | undefined {
  if (line.trim() === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function recordsFrom(raw: string): readonly Record<string, unknown>[] {
  return raw.split(/\r?\n/).flatMap((line) => {
    const parsed = parseLine(line);
    return parsed === undefined ? [] : [parsed];
  });
}

function isOpeningPrompt(record: Record<string, unknown>): boolean {
  if (prop(record, "type") !== "response_item") return false;
  const payload = prop(record, "payload");
  if (!isRecord(payload) || prop(payload, "role") !== "user") return false;
  const content = prop(payload, "content");
  if (!Array.isArray(content)) return false;
  return content.some((item) => {
    if (!isRecord(item) || prop(item, "type") !== "input_text") return false;
    const text = prop(item, "text");
    return isString(text) && text.startsWith(OPENING_PROMPT_PREFIX);
  });
}

function usageFrom(record: Record<string, unknown>): SessionUsage | undefined {
  const payload = prop(record, "payload");
  if (!isRecord(payload) || prop(payload, "type") !== "token_count") return undefined;
  const info = prop(payload, "info");
  if (!isRecord(info)) return undefined;
  const total = prop(info, "total_token_usage");
  if (!isRecord(total)) return undefined;

  const raw: Record<string, number> = {};
  for (const [key, value] of Object.entries(total)) {
    if (!isFiniteNumber(value)) return undefined;
    raw[key] = value;
  }

  const input = prop(total, "input_tokens");
  const output = prop(total, "output_tokens");
  const cachedInput = prop(total, "cached_input_tokens");
  const reasoning = prop(total, "reasoning_output_tokens");
  if (
    (input !== undefined && !isFiniteNumber(input)) ||
    (output !== undefined && !isFiniteNumber(output)) ||
    (cachedInput !== undefined && !isFiniteNumber(cachedInput)) ||
    (reasoning !== undefined && !isFiniteNumber(reasoning))
  ) {
    return undefined;
  }

  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
    ...(cachedInput === undefined ? {} : { cachedInput }),
    ...(reasoning === undefined ? {} : { reasoning }),
    raw,
  };
}

function quotaFrom(record: Record<string, unknown>): SessionQuota | undefined {
  const payload = prop(record, "payload");
  if (!isRecord(payload) || prop(payload, "type") !== "token_count") return undefined;
  const rateLimits = prop(payload, "rate_limits");
  if (!isRecord(rateLimits)) return undefined;
  const primary = prop(rateLimits, "primary");
  if (!isRecord(primary)) return undefined;
  const windowMinutes = prop(primary, "window_minutes");
  const usedPercentage = prop(primary, "used_percent");
  if (!isFiniteNumber(windowMinutes) || !isFiniteNumber(usedPercentage)) return undefined;
  return {
    window: `${windowMinutes} minutes`,
    usedPercentage,
  };
}

function latestTokenCount(
  records: readonly Record<string, unknown>[],
): Record<string, unknown> | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record === undefined) continue;
    const payload = prop(record, "payload");
    if (isRecord(payload) && prop(payload, "type") === "token_count") return record;
  }
  return undefined;
}

function factsFromRecords(records: readonly Record<string, unknown>[]): SessionFacts {
  const last = records[records.length - 1];
  const timestamp = last === undefined ? undefined : prop(last, "timestamp");
  const lastActivity = isRfc3339(timestamp)
    ? sessionFacts.known(timestamp)
    : sessionFacts.unknown().lastActivity;
  const tokenCount = latestTokenCount(records);
  const usage = tokenCount === undefined ? undefined : usageFrom(tokenCount);
  const quota = tokenCount === undefined ? undefined : quotaFrom(tokenCount);
  const promptReceived = records.some(isOpeningPrompt)
    ? sessionFacts.known<"yes">("yes")
    : sessionFacts.unknown().promptReceived;

  return {
    promptReceived,
    lastActivity,
    usage: usage === undefined ? sessionFacts.unknown().usage : sessionFacts.known(usage),
    quota: quota === undefined ? sessionFacts.unknown().quota : sessionFacts.known(quota),
    deliveryBasis: "record",
  };
}

export async function readCodexSessionFacts(identity: AgentIdentity): Promise<SessionFacts> {
  if (identity.sessionPath === undefined) return recordFacts();
  let raw: string;
  try {
    raw = await readFile(identity.sessionPath, "utf-8");
  } catch {
    return recordFacts();
  }
  return factsFromRecords(recordsFrom(raw));
}

export function createCodexSessionFactsReader(): SessionFactsReader {
  return { read: readCodexSessionFacts };
}
