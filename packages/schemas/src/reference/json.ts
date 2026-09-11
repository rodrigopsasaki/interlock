export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function prop(value: Record<string, unknown>, key: string): unknown {
  return value[key];
}

export function parseJson(text: string): unknown {
  return JSON.parse(text);
}
