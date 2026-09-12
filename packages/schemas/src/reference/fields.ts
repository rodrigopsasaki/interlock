import { branchKindLabel, describe } from "./describe.ts";
import { isArray, isRecord, isString, prop } from "./json.ts";
import type { SchemaFiles } from "./schemaFiles.ts";

export interface FieldRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
}

export interface FieldTable {
  readonly heading: string | undefined;
  readonly rows: readonly FieldRow[];
}

function rowsFromObject(
  schema: Record<string, unknown>,
  files: SchemaFiles,
  filePath: string,
): readonly FieldRow[] {
  const properties = prop(schema, "properties");
  if (!isRecord(properties)) return [];

  const requiredProp = prop(schema, "required");
  const requiredNames = isArray(requiredProp) ? requiredProp.filter(isString) : [];

  return Object.entries(properties).map(([name, propertySchema]) => {
    const required = requiredNames.includes(name);
    if (!isRecord(propertySchema)) {
      return { name, type: "unknown", required, description: "" };
    }
    const described = describe(propertySchema, files, filePath);
    return {
      name,
      type: described.type,
      required,
      description: described.description,
    };
  });
}

export function fieldTablesFor(
  schema: Record<string, unknown>,
  files: SchemaFiles,
  filePath: string,
): readonly FieldTable[] {
  const oneOf = prop(schema, "oneOf");
  if (isArray(oneOf)) {
    return oneOf.filter(isRecord).map((branch) => ({
      heading: branchKindLabel(branch),
      rows: rowsFromObject(branch, files, filePath),
    }));
  }
  return [{ heading: undefined, rows: rowsFromObject(schema, files, filePath) }];
}
