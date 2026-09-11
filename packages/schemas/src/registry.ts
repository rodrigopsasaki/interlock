import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";

export interface SchemaRegistry {
  readonly ajv: InstanceType<typeof Ajv2020>;
  readonly tags: ReadonlyMap<string, string>;
}

export function defaultSchemasDirectory(): string {
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

function isPart(schemasDirectory: string, filePath: string): boolean {
  return filePath.startsWith(join(schemasDirectory, "parts") + "/");
}

export function buildRegistry(
  schemasDirectory: string = defaultSchemasDirectory(),
): SchemaRegistry {
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const tags = new Map<string, string>();
  for (const file of jsonFilesUnder(schemasDirectory)) {
    const schema = JSON.parse(readFileSync(file, "utf-8")) as {
      readonly $id?: string;
      readonly title?: string;
    };
    ajv.addSchema(schema);
    if (!isPart(schemasDirectory, file) && schema.$id !== undefined) {
      tags.set(schema.title ?? schema.$id, schema.$id);
    }
  }
  return { ajv, tags };
}

export function validatorFor(
  registry: SchemaRegistry,
  tag: string,
): ValidateFunction | undefined {
  const id = registry.tags.get(tag);
  return id === undefined ? undefined : registry.ajv.getSchema(id);
}
