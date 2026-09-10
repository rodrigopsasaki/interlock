export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

// Mirrors ledger's own validate.ts: noPropertyAccessFromIndexSignature refuses
// dot access on an index signature, so this is the one place that reads a
// field by name.
export function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}
