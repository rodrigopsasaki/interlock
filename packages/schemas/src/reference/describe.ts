import { isArray, isRecord, isString, prop } from "./json.ts";
import { resolveRef, type SchemaFiles } from "./schemaFiles.ts";

export interface Described {
  readonly type: string;
  readonly description: string;
}

function textOf(node: Record<string, unknown>, key: string): string {
  const value = prop(node, key);
  return isString(value) ? value : "";
}

export function branchKindLabel(branch: Record<string, unknown>): string {
  const properties = prop(branch, "properties");
  if (!isRecord(properties)) return "?";
  const kind = prop(properties, "kind");
  if (!isRecord(kind)) return "?";
  const constValue = prop(kind, "const");
  if (isString(constValue)) return constValue;
  const enumValues = prop(kind, "enum");
  if (isArray(enumValues))
    return enumValues.map((value) => String(value)).join("|");
  return "?";
}

function branchSummary(branch: Record<string, unknown>): string {
  const label = branchKindLabel(branch);
  const properties = prop(branch, "properties");
  const required = prop(branch, "required");
  const requiredNames = isArray(required) ? required.filter(isString) : [];
  const extraFields = isRecord(properties)
    ? Object.keys(properties).filter((name) => name !== "kind")
    : [];
  if (extraFields.length === 0)
    return `\`${label}\`: no fields beyond \`kind\``;
  const listed = extraFields
    .map((name) => (requiredNames.includes(name) ? name : `${name} (optional)`))
    .join(", ");
  return `\`${label}\`: ${listed}`;
}

function describeOneOf(node: Record<string, unknown>): Described {
  const branches = prop(node, "oneOf");
  if (!isArray(branches)) return { type: "oneOf", description: "" };
  const records = branches.filter(isRecord);
  return {
    type: `one of ${records.map((branch) => `\`${branchKindLabel(branch)}\``).join(", ")}`,
    description: records.map(branchSummary).join("; "),
  };
}

function describeObject(
  node: Record<string, unknown>,
  files: SchemaFiles,
  filePath: string,
): Described {
  const properties = prop(node, "properties");
  if (!isRecord(properties))
    return { type: "object", description: textOf(node, "description") };

  const required = prop(node, "required");
  const requiredNames = isArray(required) ? required.filter(isString) : [];
  const rows = Object.entries(properties).map(([name, propertySchema]) => {
    const flag = requiredNames.includes(name) ? "required" : "optional";
    if (!isRecord(propertySchema)) return `${name} (${flag})`;
    const described = describe(propertySchema, files, filePath);
    return `${name} (${described.type}, ${flag})`;
  });
  return { type: "object", description: `fields: ${rows.join("; ")}` };
}

export function describe(
  node: Record<string, unknown>,
  files: SchemaFiles,
  filePath: string,
): Described {
  const ref = prop(node, "$ref");
  if (isString(ref)) {
    const resolved = resolveRef(files, ref, filePath);
    const title = prop(resolved.node, "title");
    const description = prop(resolved.node, "description");
    if (isString(title) && isString(description))
      return { type: title, description };

    const inner = describe(resolved.node, files, resolved.file);
    const localName = ref.startsWith("#/")
      ? ref.slice(ref.lastIndexOf("/") + 1)
      : inner.type;
    return { type: localName, description: inner.description };
  }

  if ("const" in node) {
    return {
      type: `the literal \`${JSON.stringify(prop(node, "const"))}\``,
      description: textOf(node, "description"),
    };
  }

  if ("enum" in node) {
    const values = prop(node, "enum");
    const type = isArray(values)
      ? `one of ${values.map((value) => `\`${JSON.stringify(value)}\``).join(", ")}`
      : "enum";
    return { type, description: textOf(node, "description") };
  }

  if (prop(node, "oneOf") !== undefined) return describeOneOf(node);

  const type = prop(node, "type");
  if (type === "array") {
    const items = prop(node, "items");
    if (!isRecord(items)) return { type: "array", description: "" };
    const inner = describe(items, files, filePath);
    return { type: `array of ${inner.type}`, description: inner.description };
  }
  if (type === "object") return describeObject(node, files, filePath);
  if (type === "string") {
    const pattern = prop(node, "pattern");
    const suffix = isString(pattern) ? ` matching \`${pattern}\`` : "";
    return {
      type: `string${suffix}`,
      description: textOf(node, "description"),
    };
  }
  if (type === "number")
    return { type: "number", description: textOf(node, "description") };
  if (type === "boolean")
    return { type: "boolean", description: textOf(node, "description") };

  return { type: "unknown", description: textOf(node, "description") };
}
