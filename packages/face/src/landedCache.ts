import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Landed, LandedBy } from "./landed.ts";
import type { MainSnapshot } from "./mainLine.ts";

export const LANDED_CACHE_VERSION = "landed-cache@1";

export const LANDED_CACHE_FILE = "landed-cache.json";

export const CACHE_DIRECTORY = ".cache";

export type RecordedBase =
  | { readonly kind: "recorded"; readonly sha: string }
  | { readonly kind: "absent" };

export interface LandedKey {
  readonly main: string;
  readonly mainSha: string;
  readonly head: string;
  readonly base: RecordedBase;
}

export interface CachedLanded {
  readonly key: LandedKey;
  readonly landed: Landed;
}

export function landedCachePath(repoRoot: string): string {
  return join(repoRoot, ".interlock", CACHE_DIRECTORY, LANDED_CACHE_FILE);
}

export function landedKeyOf(main: MainSnapshot, head: string, base: string | undefined): LandedKey {
  return {
    main: main.branch,
    mainSha: main.sha,
    head,
    base: base === undefined ? { kind: "absent" } : { kind: "recorded", sha: base },
  };
}

export function landedKeyText(key: LandedKey): string {
  return JSON.stringify([
    key.main,
    key.mainSha,
    key.head,
    key.base.kind === "recorded" ? key.base.sha : null,
  ]);
}

const FULL_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

const LANDED_BY: readonly LandedBy[] = ["ancestry", "patch", "squash"];

type Fields = Readonly<Record<string, unknown>>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFullSha(value: unknown): value is string {
  return typeof value === "string" && FULL_SHA.test(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasExactly(fields: Fields, names: readonly string[]): boolean {
  const own = Object.keys(fields);
  return own.length === names.length && names.every((name) => own.includes(name));
}

function landedByOf(value: unknown): LandedBy | undefined {
  return LANDED_BY.find((by) => by === value);
}

function revertedOf(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const shas = value.filter(isFullSha);
  return shas.length === value.length && new Set(shas).size === shas.length ? shas : undefined;
}

function revertedByOf(
  value: unknown,
  reverted: readonly string[],
): Readonly<Record<string, string>> | undefined {
  if (!isFields(value) || !hasExactly(value, reverted)) return undefined;
  const pairs: Record<string, string> = {};
  for (const sha of reverted) {
    const undoer = value[sha];
    if (!isFullSha(undoer)) return undefined;
    pairs[sha] = undoer;
  }
  return pairs;
}

function landedOfFields(value: unknown, key: LandedKey): Landed | undefined {
  if (!isFields(value)) return undefined;
  const { kind, main, head } = value;
  if (kind === "unknown") {
    const { because } = value;
    return hasExactly(value, ["kind", "because"]) && isText(because)
      ? { kind, because }
      : undefined;
  }
  if (main !== key.main || head !== key.head || !isText(main) || !isText(head)) return undefined;
  switch (kind) {
    case "on-main": {
      const by = landedByOf(value["by"]);
      return hasExactly(value, ["kind", "main", "head", "by"]) && by !== undefined
        ? { kind, main, head, by }
        : undefined;
    }
    case "not-on-main":
      return hasExactly(value, ["kind", "main", "head"]) ? { kind, main, head } : undefined;
    case "reverted-on-main": {
      const { revertedBy } = value;
      return hasExactly(value, ["kind", "main", "head", "revertedBy"]) && isFullSha(revertedBy)
        ? { kind, main, head, revertedBy }
        : undefined;
    }
    case "partly-reverted-on-main": {
      if (!hasExactly(value, ["kind", "main", "head", "reverted", "revertedBy"])) return undefined;
      const reverted = revertedOf(value["reverted"]);
      const revertedBy =
        reverted === undefined ? undefined : revertedByOf(value["revertedBy"], reverted);
      return reverted === undefined || revertedBy === undefined
        ? undefined
        : { kind, main, head, reverted, revertedBy };
    }
    default:
      return undefined;
  }
}

function baseOf(value: unknown): RecordedBase | undefined {
  if (!isFields(value)) return undefined;
  if (value["kind"] === "absent" && hasExactly(value, ["kind"])) return { kind: "absent" };
  const { sha } = value;
  return value["kind"] === "recorded" && hasExactly(value, ["kind", "sha"]) && isFullSha(sha)
    ? { kind: "recorded", sha }
    : undefined;
}

function cachedOf(value: unknown): CachedLanded | undefined {
  if (!isFields(value) || !hasExactly(value, ["main", "mainSha", "head", "base", "landed"])) {
    return undefined;
  }
  const { main, mainSha, head } = value;
  const base = baseOf(value["base"]);
  if (!isText(main) || !isFullSha(mainSha) || !isFullSha(head) || base === undefined) {
    return undefined;
  }
  const key = { main, mainSha, head, base };
  const landed = landedOfFields(value["landed"], key);
  return landed === undefined ? undefined : { key, landed };
}

function entriesOf(text: string): readonly CachedLanded[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isFields(parsed) || parsed["version"] !== LANDED_CACHE_VERSION) return [];
  const { entries } = parsed;
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry: unknown) => {
    const cached = cachedOf(entry);
    return cached === undefined ? [] : [cached];
  });
}

function isOn(main: MainSnapshot, key: LandedKey): boolean {
  return key.main === main.branch && key.mainSha === main.sha;
}

export async function readLandedCache(
  repoRoot: string,
  main: MainSnapshot,
): Promise<readonly CachedLanded[]> {
  let text: string;
  try {
    text = await readFile(landedCachePath(repoRoot), "utf-8");
  } catch {
    return [];
  }
  return entriesOf(text).filter((entry) => isOn(main, entry.key));
}

function serialized(entry: CachedLanded): unknown {
  return { ...entry.key, landed: entry.landed };
}

export async function writeLandedCache(
  repoRoot: string,
  entries: readonly CachedLanded[],
): Promise<void> {
  const path = landedCachePath(repoRoot);
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const reusable = entries.map(serialized).filter((entry) => cachedOf(entry) !== undefined);
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(join(dirname(path), ".gitignore"), "*\n", { flag: "wx" }).catch(
      () => undefined,
    );
    await writeFile(
      temporary,
      `${JSON.stringify({ version: LANDED_CACHE_VERSION, entries: reusable })}\n`,
      { flag: "wx" },
    );
    await rename(temporary, path);
  } catch {
    await unlink(temporary).catch(() => undefined);
  }
}
