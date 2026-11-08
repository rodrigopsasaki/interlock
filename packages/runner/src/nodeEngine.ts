import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { err, ok, type Result } from "@phyxiusjs/fp";
import { runOwnedCommand } from "./ownedCommand.ts";

type Version = {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
};

type Comparator = {
  readonly operator: "exact" | ">=" | ">" | "<=" | "<";
  readonly version: Version;
};

export type NodeEngineRefusal = {
  readonly kind: "node-engine";
  readonly because: string;
};

type JsonObject = { readonly [key: string]: unknown };

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseVersion(value: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (![major, minor, patch].every((part) => Number.isSafeInteger(part))) return undefined;
  return { major, minor, patch };
}

function parseRangeVersion(value: string): Version | undefined {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/.exec(value);
  if (match === null) return undefined;
  const major = Number(match[1]);
  const minor = Number(match[2] ?? "0");
  const patch = Number(match[3] ?? "0");
  if (![major, minor, patch].every((part) => Number.isSafeInteger(part))) return undefined;
  return { major, minor, patch };
}

function parseComparator(value: string): Comparator | undefined {
  const match = /^(>=|<=|>|<)?(v?\d+(?:\.\d+){0,2})$/.exec(value);
  if (match === null) return undefined;
  const version = parseRangeVersion(match[2] ?? "");
  if (version === undefined) return undefined;
  const operator = match[1];
  return {
    operator:
      operator === undefined
        ? "exact"
        : operator === ">=" || operator === ">" || operator === "<=" || operator === "<"
          ? operator
          : "exact",
    version,
  };
}

function parseRange(value: string): readonly Comparator[] | undefined {
  const tokens = value
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (tokens.length === 0) return undefined;
  const comparators: Comparator[] = [];
  for (const token of tokens) {
    const comparator = parseComparator(token);
    if (comparator === undefined) return undefined;
    comparators.push(comparator);
  }
  return comparators;
}

function compareVersions(left: Version, right: Version): number {
  if (left.major !== right.major) return left.major - right.major;
  if (left.minor !== right.minor) return left.minor - right.minor;
  return left.patch - right.patch;
}

function satisfies(version: Version, comparators: readonly Comparator[]): boolean {
  return comparators.every((comparator) => {
    const comparison = compareVersions(version, comparator.version);
    switch (comparator.operator) {
      case "exact":
        return comparison === 0;
      case ">=":
        return comparison >= 0;
      case ">":
        return comparison > 0;
      case "<=":
        return comparison <= 0;
      case "<":
        return comparison < 0;
      default:
        return false;
    }
  });
}

async function engineRange(worktree: string): Promise<string | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(worktree, "package.json"), "utf8"));
    if (!isJsonObject(parsed)) return undefined;
    const engines = parsed["engines"];
    if (!isJsonObject(engines)) return undefined;
    return typeof engines["node"] === "string" ? engines["node"] : undefined;
  } catch {
    return undefined;
  }
}

async function resolveNode(
  pathValue: string | undefined,
  cwd: string,
): Promise<string | undefined> {
  const pathEntries = (pathValue ?? "").split(delimiter);
  for (const entry of pathEntries) {
    const directory = entry.length === 0 ? cwd : isAbsolute(entry) ? entry : resolve(cwd, entry);
    const candidate = join(directory, "node");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return undefined;
}

function refusal(because: string): Result<void, NodeEngineRefusal> {
  return err({ kind: "node-engine", because });
}

export async function checkNodeEngine(
  worktree: string,
  phase: "gate" | "worktree setup",
  env: NodeJS.ProcessEnv,
  heavy: readonly string[],
): Promise<Result<void, NodeEngineRefusal>> {
  const range = await engineRange(worktree);
  if (range === undefined) return ok(undefined);

  const executable = await resolveNode(env["PATH"], worktree);
  if (executable === undefined) {
    return refusal(`${phase} node could not be found on PATH ${env["PATH"] ?? "(empty)"}`);
  }

  const versionResult = await runOwnedCommand(
    [...heavy, "mise", "exec", "--", executable, "--version"],
    worktree,
    env,
  );
  if (versionResult._tag === "Err") {
    return refusal(
      `${phase} node at ${executable} could not run for its version: ${versionResult.error}`,
    );
  }
  if (versionResult.value.code !== 0 || versionResult.value.signal !== null) {
    const detail = versionResult.value.stderr.trim() || versionResult.value.stdout.trim();
    const ended =
      versionResult.value.signal === null
        ? `exited ${versionResult.value.code}`
        : `was killed by ${versionResult.value.signal}`;
    return refusal(
      `${phase} node at ${executable} could not run for its version: ${detail.length === 0 ? ended : detail}`,
    );
  }
  const versionOutput = versionResult.value.stdout.trim();
  const version = parseVersion(versionOutput.split(/\s+/)[0] ?? "");
  if (version === undefined) {
    return refusal(
      `${phase} node at ${executable} could not report a version: ${versionOutput || "no output"}`,
    );
  }

  const comparators = parseRange(range);
  if (comparators === undefined) {
    return refusal(`${phase} node ${versionOutput} at ${executable} cannot parse engines ${range}`);
  }
  if (!satisfies(version, comparators)) {
    return refusal(`${phase} node ${versionOutput} at ${executable} is outside engines ${range}`);
  }
  return ok(undefined);
}

export function explainNodeEngineRefusal(refusalValue: NodeEngineRefusal): string {
  return refusalValue.because;
}
