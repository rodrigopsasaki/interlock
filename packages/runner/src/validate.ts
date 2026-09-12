// Mirrors ledger's and face's own validate.ts: noPropertyAccessFromIndexSignature refuses dot
// access on an index signature, so this is the one place that reads a field by name.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

export function stringAt(
  value: unknown,
  ...keys: readonly string[]
): string | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = prop(current, key);
  }
  return isString(current) ? current : undefined;
}

export function numberAt(
  value: unknown,
  ...keys: readonly string[]
): number | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = prop(current, key);
  }
  return typeof current === "number" ? current : undefined;
}
