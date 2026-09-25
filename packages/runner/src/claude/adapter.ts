import { readFile } from "node:fs/promises";
import { type SessionFacts, type SessionUsage, sessionFacts, type Unknown } from "ledger";
import type { AgentIdentity, SessionFactsReader } from "../runtime.ts";
import { isRecord, isString, numberAt, prop } from "../validate.ts";

const UNKNOWN_FACT: Unknown = { state: "unknown" };

const RFC3339_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isRfc3339(value: unknown): value is string {
  return isString(value) && RFC3339_PATTERN.test(value) && Number.isFinite(Date.parse(value));
}

const USAGE_COUNTER_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_creation_input_tokens",
  "cache_read_input_tokens",
] as const;

function parseTranscriptLines(text: string): readonly Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (isRecord(parsed)) records.push(parsed);
  }
  return records;
}

function isOpeningPromptRecord(record: Record<string, unknown>): boolean {
  if (prop(record, "type") !== "user") return false;
  if (prop(record, "parentUuid") !== null) return false;
  if (prop(record, "isSidechain") !== false) return false;
  const message = prop(record, "message");
  return isRecord(message) && prop(message, "role") === "user";
}

function lastActivityTimestamp(records: readonly Record<string, unknown>[]): string | undefined {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record === undefined) continue;
    const timestamp = prop(record, "timestamp");
    if (isRfc3339(timestamp)) return timestamp;
  }
  return undefined;
}

interface UsageTotals {
  readonly counters: ReadonlyMap<string, number>;
  readonly observed: boolean;
}

function accumulateUsage(records: readonly Record<string, unknown>[]): UsageTotals {
  const counters = new Map<string, number>();
  let observed = false;
  const add = (key: string, value: unknown): void => {
    if (typeof value !== "number" || !Number.isFinite(value)) return;
    counters.set(key, (counters.get(key) ?? 0) + value);
    observed = true;
  };

  for (const record of records) {
    if (prop(record, "type") !== "assistant") continue;
    const message = prop(record, "message");
    if (!isRecord(message)) continue;
    const usage = prop(message, "usage");
    if (!isRecord(usage)) continue;
    for (const field of USAGE_COUNTER_FIELDS) add(field, prop(usage, field));
    add("thinking_tokens", numberAt(usage, "output_tokens_details", "thinking_tokens"));
  }

  return { counters, observed };
}

function toSessionUsage(totals: UsageTotals): SessionUsage {
  const raw = Object.fromEntries(totals.counters);
  const input = totals.counters.get("input_tokens");
  const output = totals.counters.get("output_tokens");
  const cachedInput = totals.counters.get("cache_read_input_tokens");
  const reasoning = totals.counters.get("thinking_tokens");
  return {
    ...(input !== undefined ? { input } : {}),
    ...(output !== undefined ? { output } : {}),
    ...(cachedInput !== undefined ? { cachedInput } : {}),
    ...(reasoning !== undefined ? { reasoning } : {}),
    raw,
  };
}

function factsFromRecords(records: readonly Record<string, unknown>[]): SessionFacts {
  const lastActivity = lastActivityTimestamp(records);
  const usageTotals = accumulateUsage(records);
  const base = {
    lastActivity: lastActivity !== undefined ? sessionFacts.known(lastActivity) : UNKNOWN_FACT,
    usage: usageTotals.observed ? sessionFacts.known(toSessionUsage(usageTotals)) : UNKNOWN_FACT,
    quota: UNKNOWN_FACT,
  };

  return records.some(isOpeningPromptRecord)
    ? {
        ...base,
        promptReceived: sessionFacts.known("yes" as const),
        deliveryBasis: "record",
      }
    : { ...base, promptReceived: UNKNOWN_FACT, deliveryBasis: "status" };
}

export function createClaudeSessionFactsReader(): SessionFactsReader {
  return {
    async read(identity: AgentIdentity): Promise<SessionFacts> {
      if (identity.sessionPath === undefined) return sessionFacts.unknown();
      let text: string;
      try {
        text = await readFile(identity.sessionPath, "utf-8");
      } catch {
        return sessionFacts.unknown();
      }
      return factsFromRecords(parseTranscriptLines(text));
    },
  };
}
