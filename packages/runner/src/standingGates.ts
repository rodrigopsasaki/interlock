import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { parseExpectOutput } from "ledger";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { isRecord, isString, prop } from "./validate.ts";

export interface StandingGate {
  readonly id: string;
  readonly kind: string;
  readonly run: string;
  readonly expectOutput?: RegExp;
}

export type StandingGatesRefusal =
  | { readonly kind: "missing"; readonly path: string }
  | {
      readonly kind: "malformed";
      readonly path: string;
      readonly reason: string;
    };

export function explainStandingGatesRefusal(refusal: StandingGatesRefusal): string {
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

const MALFORMED_STANDING_GATES =
  '"standing_gates" must be a list of entries with a string "id", "kind" and "run"';

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
    const reason = error instanceof YAMLParseError ? error.message : "invalid YAML";
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
  if (!Array.isArray(standing)) {
    return err({ kind: "malformed", path, reason: MALFORMED_STANDING_GATES });
  }

  const gates: StandingGate[] = [];
  for (const entry of standing) {
    if (!isRecord(entry)) {
      return err({ kind: "malformed", path, reason: MALFORMED_STANDING_GATES });
    }
    const id = prop(entry, "id");
    const gateKind = prop(entry, "kind");
    const run = prop(entry, "run");
    const expectOutputSource = prop(entry, "expect_output");
    if (
      !isString(id) ||
      !isString(gateKind) ||
      !isString(run) ||
      (expectOutputSource !== undefined && !isString(expectOutputSource))
    ) {
      return err({ kind: "malformed", path, reason: MALFORMED_STANDING_GATES });
    }

    if (expectOutputSource === undefined) {
      gates.push({ id, kind: gateKind, run });
      continue;
    }
    const compiled = parseExpectOutput(expectOutputSource);
    if (isErr(compiled)) {
      return err({
        kind: "malformed",
        path,
        reason: `gate "${id}": expect_output "${expectOutputSource}" is not a valid regular expression (${compiled.error})`,
      });
    }
    gates.push({ id, kind: gateKind, run, expectOutput: compiled.value });
  }
  return ok(gates);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
