import type { ArtifactVersion } from "./artifacts.ts";
import { branchKindLabel } from "./describe.ts";
import { isArray, isRecord, isString, prop } from "./json.ts";

interface PropertyEntry {
  readonly schema: unknown;
  readonly required: boolean;
}

function objectProps(
  schema: Record<string, unknown>,
): Map<string, PropertyEntry> {
  const properties = prop(schema, "properties");
  const required = prop(schema, "required");
  const requiredNames = isArray(required) ? required.filter(isString) : [];

  const map = new Map<string, PropertyEntry>();
  if (!isRecord(properties)) return map;
  for (const [name, propertySchema] of Object.entries(properties)) {
    map.set(name, {
      schema: propertySchema,
      required: requiredNames.includes(name),
    });
  }
  return map;
}

function propertyDiff(
  prevSchema: Record<string, unknown>,
  currSchema: Record<string, unknown>,
): readonly string[] {
  const prevProps = objectProps(prevSchema);
  const currProps = objectProps(currSchema);
  const changes: string[] = [];

  for (const [name, curr] of currProps) {
    if (name === "interlock") continue;
    const prev = prevProps.get(name);
    if (prev === undefined) {
      changes.push(
        `added \`${name}\` (${curr.required ? "required" : "optional"})`,
      );
      continue;
    }
    if (prev.required && !curr.required)
      changes.push(`\`${name}\` became optional`);
    if (!prev.required && curr.required)
      changes.push(`\`${name}\` became required`);
    if (JSON.stringify(prev.schema) !== JSON.stringify(curr.schema)) {
      changes.push(`retyped \`${name}\``);
    }
  }
  for (const [name] of prevProps) {
    if (name === "interlock") continue;
    if (!currProps.has(name)) changes.push(`removed \`${name}\``);
  }
  return changes;
}

function branchMap(
  schema: Record<string, unknown>,
): Map<string, Record<string, unknown>> {
  const oneOf = prop(schema, "oneOf");
  const map = new Map<string, Record<string, unknown>>();
  if (!isArray(oneOf)) return map;
  for (const branch of oneOf) {
    if (isRecord(branch)) map.set(branchKindLabel(branch), branch);
  }
  return map;
}

function oneOfDiff(
  prevSchema: Record<string, unknown>,
  currSchema: Record<string, unknown>,
): readonly string[] {
  const prevBranches = branchMap(prevSchema);
  const currBranches = branchMap(currSchema);
  const changes: string[] = [];

  for (const [identity, curr] of currBranches) {
    const prev = prevBranches.get(identity);
    if (prev === undefined) {
      changes.push(`added kind \`${identity}\``);
      continue;
    }
    for (const change of propertyDiff(prev, curr)) {
      changes.push(`within kind \`${identity}\`: ${change}`);
    }
  }
  for (const identity of prevBranches.keys()) {
    if (!currBranches.has(identity))
      changes.push(`removed kind \`${identity}\``);
  }
  return changes;
}

export function diffVersions(
  previous: ArtifactVersion,
  current: ArtifactVersion,
): readonly string[] {
  const previousIsOneOf = prop(previous.schema, "oneOf") !== undefined;
  const currentIsOneOf = prop(current.schema, "oneOf") !== undefined;
  const changes =
    previousIsOneOf || currentIsOneOf
      ? oneOfDiff(previous.schema, current.schema)
      : propertyDiff(previous.schema, current.schema);
  return changes.length === 0
    ? ["no field changes from the previous version"]
    : changes;
}
