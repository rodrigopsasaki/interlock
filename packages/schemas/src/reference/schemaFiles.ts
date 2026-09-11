import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { isRecord, parseJson, prop } from "./json.ts";

export interface SchemaFiles {
  readonly byPath: ReadonlyMap<string, Record<string, unknown>>;
}

function jsonFilesUnder(directory: string): readonly string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...jsonFilesUnder(path));
    else if (entry.name.endsWith(".json")) files.push(path);
  }
  return files;
}

export function loadSchemaFiles(schemasDirectory: string): SchemaFiles {
  const byPath = new Map<string, Record<string, unknown>>();
  for (const file of jsonFilesUnder(schemasDirectory)) {
    const parsed = parseJson(readFileSync(file, "utf-8"));
    if (!isRecord(parsed)) {
      throw new Error(`${file}: expected a JSON object at the schema root`);
    }
    byPath.set(file, parsed);
  }
  return { byPath };
}

export interface ResolvedRef {
  readonly node: Record<string, unknown>;
  readonly file: string;
}

function resolveLocalPointer(
  files: SchemaFiles,
  ref: string,
  fromFile: string,
): ResolvedRef {
  const root = files.byPath.get(fromFile);
  if (root === undefined) {
    throw new Error(`${fromFile}: schema file was not loaded`);
  }
  let node = root;
  for (const segment of ref.slice(2).split("/")) {
    const next = prop(node, segment);
    if (!isRecord(next)) {
      throw new Error(
        `${fromFile}${ref}: no such local pointer segment "${segment}"`,
      );
    }
    node = next;
  }
  return { node, file: fromFile };
}

export function resolveRef(
  files: SchemaFiles,
  ref: string,
  fromFile: string,
): ResolvedRef {
  if (ref.startsWith("#/")) return resolveLocalPointer(files, ref, fromFile);
  const targetPath = join(dirname(fromFile), ref);
  const node = files.byPath.get(targetPath);
  if (node === undefined) {
    throw new Error(
      `${ref} referenced from ${fromFile}: no such schema file loaded`,
    );
  }
  return { node, file: targetPath };
}
