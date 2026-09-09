export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString);
}

// `Record<string, unknown>` carries only an index signature, so
// `noPropertyAccessFromIndexSignature` refuses `value.field` on it. This is
// the one place that reads such a field, by name, so nothing else needs to.
export function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}
