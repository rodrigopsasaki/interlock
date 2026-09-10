import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, type Result } from "@phyxiusjs/fp";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { isRecord, isString, prop } from "./validate.ts";

export interface StandingGate {
  readonly id: string;
  readonly run: string;
}

export type StandingGatesRefusal =
  | { readonly kind: "missing"; readonly path: string }
  | {
      readonly kind: "malformed";
      readonly path: string;
      readonly reason: string;
    };

export function explainStandingGatesRefusal(
  refusal: StandingGatesRefusal,
): string {
  switch (refusal.kind) {
    case "missing":
      return `${refusal.path}: no standing gate table; expected a config@v0 document.`;
    case "malformed":
      return `${refusal.path}: ${refusal.reason}`;
  }
}

export function configPath(repoRoot: string): string {
  return join(repoRoot, ".interlock", "config.yaml");
}

function isStandingGate(value: unknown): value is StandingGate {
  return (
    isRecord(value) &&
    isString(prop(value, "id")) &&
    isString(prop(value, "run"))
  );
}

export async function loadStandingGates(
  repoRoot: string,
): Promise<Result<readonly StandingGate[], StandingGatesRefusal>> {
  const path = configPath(repoRoot);
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return err({ kind: "missing", path });
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason =
      error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed", path, reason });
  }

  if (!isRecord(parsed)) {
    return err({
      kind: "malformed",
      path,
      reason: "the document is not a YAML mapping",
    });
  }
  const standing = prop(parsed, "standing_gates");
  if (!Array.isArray(standing) || !standing.every(isStandingGate)) {
    return err({
      kind: "malformed",
      path,
      reason:
        '"standing_gates" must be a list of entries with a string "id" and "run"',
    });
  }
  return ok(standing);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
