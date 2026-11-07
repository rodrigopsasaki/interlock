import { open, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProviderHeadroom } from "ledger";
import { isRecord, prop } from "../validate.ts";

export function codexSessionsRoot(): string {
  return join(process.env["CODEX_HOME"] || join(homedir(), ".codex"), "sessions");
}

async function rolloutFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await rolloutFiles(path)));
    else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl"))
      files.push(path);
  }
  return files;
}

interface AllowanceReport {
  readonly headroom: ProviderHeadroom;
  readonly at: number | undefined;
}

function reading(line: string, source: string, now: number): AllowanceReport | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || prop(raw, "type") !== "event_msg") return undefined;
  const payload = prop(raw, "payload");
  if (!isRecord(payload) || prop(payload, "type") !== "token_count") return undefined;
  const limits = prop(payload, "rate_limits");
  if (!isRecord(limits)) return undefined;
  const candidates: ProviderHeadroom[] = [];
  const limited = prop(limits, "rate_limit_reached_type");
  for (const window of ["primary", "secondary"]) {
    const value = prop(limits, window);
    if (!isRecord(value)) continue;
    const used = prop(value, "used_percent");
    const reset = prop(value, "resets_at");
    if (typeof used !== "number" || !Number.isFinite(used) || used < 0 || used > 100) continue;
    if (typeof reset !== "number" || !Number.isFinite(reset) || reset * 1000 <= now) continue;
    candidates.push({
      state: "known",
      fraction: (100 - used) / 100,
      raw: used,
      unit: "percent used",
      source: `${source} payload.rate_limits.${window} (resets_at ${reset})`,
      rateLimited: limited !== null && limited !== undefined,
    });
  }
  let smallest: ProviderHeadroom | undefined;
  for (const candidate of candidates) {
    if (
      candidate.state === "known" &&
      (smallest === undefined ||
        smallest.state !== "known" ||
        candidate.fraction < smallest.fraction)
    )
      smallest = candidate;
  }
  const timestamp = prop(raw, "timestamp");
  const at = typeof timestamp === "string" ? Date.parse(timestamp) : Number.NaN;
  return {
    headroom: smallest ?? {
      state: "unknown",
      reason: `${source}: no unexpired allowance window to divide by`,
    },
    at: Number.isFinite(at) ? at : undefined,
  };
}

async function latestReading(path: string, now: number): Promise<AllowanceReport | undefined> {
  const file = await open(path, "r");
  try {
    let end = (await file.stat()).size;
    let suffix = "";
    while (end > 0) {
      const start = Math.max(0, end - 64 * 1024);
      const buffer = Buffer.alloc(end - start);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, start);
      const lines = (buffer.subarray(0, bytesRead).toString("utf-8") + suffix).split("\n");
      suffix = start > 0 ? (lines.shift() ?? "") : "";
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const found = reading(lines[index] ?? "", path, now);
        if (found !== undefined) return found;
      }
      end = start;
    }
    return undefined;
  } finally {
    await file.close();
  }
}

export async function readCodexHeadroom(
  root = codexSessionsRoot(),
  now = Date.now(),
): Promise<ProviderHeadroom> {
  try {
    const paths = await rolloutFiles(root);
    const files = await Promise.all(
      paths.map(async (path) => ({ path, modified: (await stat(path)).mtimeMs })),
    );
    files.sort((left, right) => left.path.localeCompare(right.path));
    let latest: { readonly at: number; readonly headroom: ProviderHeadroom } | undefined;
    for (const file of files) {
      const found = await latestReading(file.path, now);
      if (found === undefined) continue;
      const at = found.at ?? file.modified;
      if (latest === undefined || at > latest.at) latest = { at, headroom: found.headroom };
    }
    return (
      latest?.headroom ?? { state: "unknown", reason: `${root}: no reported rate_limits allowance` }
    );
  } catch (error) {
    return {
      state: "unknown",
      reason: `${root}: local allowance cannot be read (${error instanceof Error ? error.message : "unknown error"})`,
    };
  }
}
