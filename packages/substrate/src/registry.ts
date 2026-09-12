import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { Item } from "debrief";
import type { Gap } from "ledger";
import { isRecord } from "./validate.ts";

function schemasDirectory(): string {
  return join(import.meta.dirname, "..", "..", "..", "schemas");
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

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf-8"));
}

const ajv = new Ajv2020({ strict: true, allErrors: true });
for (const file of jsonFilesUnder(schemasDirectory())) {
  const schema = readJson(file);
  if (isRecord(schema)) ajv.addSchema(schema);
}

const SUBSTRATE_BASE = "https://github.com/rodrigopsasaki/interlock/schemas/substrate@v1";

export interface ContextResponseWire {
  readonly items: readonly Item[];
  readonly vocabulary: string;
}

export interface AbsorbResponseWire {
  readonly decisions_absorbed: readonly string[];
  readonly discoveries: readonly {
    readonly id: string;
    readonly placement: "known" | "new" | "unplaced";
  }[];
  readonly gaps: readonly Gap[];
}

export interface CapabilitiesResponseWire {
  readonly capabilities: readonly string[];
}

export interface CompiledResponse<T> {
  readonly validate: (value: unknown) => value is T;
  readonly errors: () => string;
}

function compileResponse<T>(id: string): CompiledResponse<T> | undefined {
  const compiled = ajv.getSchema<T>(id);
  if (compiled === undefined) return undefined;
  return {
    validate: (value: unknown): value is T => compiled(value) === true,
    errors: () =>
      (compiled.errors ?? [])
        .map((error) => {
          const pointer = error.instancePath === "" ? "(root)" : error.instancePath;
          return `${pointer}: ${error.message ?? "is invalid"}`;
        })
        .join("; "),
  };
}

export const contextResponseSchema = compileResponse<ContextResponseWire>(
  `${SUBSTRATE_BASE}/context.response.json`,
);
export const absorbResponseSchema = compileResponse<AbsorbResponseWire>(
  `${SUBSTRATE_BASE}/absorb.response.json`,
);
export const capabilitiesResponseSchema = compileResponse<CapabilitiesResponseWire>(
  `${SUBSTRATE_BASE}/capabilities.response.json`,
);
