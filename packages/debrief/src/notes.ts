import { readFile } from "node:fs/promises";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { shapeTag, type Note } from "ledger";
import { parse as parseYaml, YAMLParseError } from "yaml";
import { isRecord, isString, isStringArray, prop } from "./validate.ts";

export const NOTES_V0 = "notes@v0";

export type NotesRefusal =
  | { readonly kind: "missing-file"; readonly path: string }
  | {
      readonly kind: "malformed-yaml";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "unknown-shape";
      readonly path: string;
      readonly tag: string | undefined;
    }
  | {
      readonly kind: "invalid-shape";
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "invalid-entry";
      readonly path: string;
      readonly index: number;
      readonly reason: string;
    };

export function explainNotesRefusal(refusal: NotesRefusal): string {
  switch (refusal.kind) {
    case "missing-file":
      return `${refusal.path}: no such file.`;
    case "malformed-yaml":
      return `${refusal.path}: ${refusal.reason}`;
    case "unknown-shape":
      return `${refusal.path}: shape tag is ${refusal.tag === undefined ? "missing" : `"${refusal.tag}"`}, expected "${NOTES_V0}".`;
    case "invalid-shape":
      return `${refusal.path}: ${refusal.reason}`;
    case "invalid-entry":
      return `${refusal.path}: entry ${refusal.index}: ${refusal.reason}.`;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function parseEntry(raw: unknown): Result<Note, string> {
  if (!isRecord(raw)) return err("not a mapping");

  const at = prop(raw, "at");
  if (!isString(at)) return err('"at" is missing or not a string');

  const kind = prop(raw, "kind");
  if (kind === "choice") {
    const chose = prop(raw, "chose");
    if (!isString(chose)) return err('missing "chose"');
    const because = prop(raw, "because");
    if (!isString(because)) return err('missing "because"');
    const rejected = prop(raw, "rejected");
    return ok(
      isStringArray(rejected)
        ? { kind: "choice", at, chose, because, rejected }
        : { kind: "choice", at, chose, because },
    );
  }
  if (kind === "surprise") {
    const expected = prop(raw, "expected");
    if (!isString(expected)) return err('missing "expected"');
    const observed = prop(raw, "observed");
    if (!isString(observed)) return err('missing "observed"');
    return ok({ kind: "surprise", at, expected, observed });
  }
  return err('"kind" must be "choice" or "surprise"');
}

export async function readNotesFile(
  path: string,
): Promise<Result<readonly Note[], NotesRefusal>> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT")
      return err({ kind: "missing-file", path });
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (error) {
    const reason =
      error instanceof YAMLParseError ? error.message : "invalid YAML";
    return err({ kind: "malformed-yaml", path, reason });
  }

  if (!isRecord(parsed))
    return err({
      kind: "invalid-shape",
      path,
      reason: "the document is not a YAML mapping",
    });

  const tag = shapeTag(parsed);
  if (tag !== NOTES_V0) return err({ kind: "unknown-shape", path, tag });

  const node = prop(parsed, "node");
  if (!isString(node))
    return err({
      kind: "invalid-shape",
      path,
      reason: '"node" is missing or not a string',
    });

  const entries = prop(parsed, "entries");
  if (!Array.isArray(entries))
    return err({
      kind: "invalid-shape",
      path,
      reason: '"entries" must be a list',
    });

  const notes: Note[] = [];
  for (const [index, entry] of entries.entries()) {
    const parsedEntry = parseEntry(entry);
    if (isErr(parsedEntry))
      return err({
        kind: "invalid-entry",
        path,
        index,
        reason: parsedEntry.error,
      });
    notes.push(parsedEntry.value);
  }
  return ok(notes);
}
