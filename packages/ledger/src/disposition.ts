export type Disposition = "retry" | "repair" | "hold" | "cancel" | "terminal-failure";

const DISPOSITIONS: ReadonlySet<string> = new Set([
  "retry",
  "repair",
  "hold",
  "cancel",
  "terminal-failure",
]);

export function isDisposition(value: unknown): value is Disposition {
  return typeof value === "string" && DISPOSITIONS.has(value);
}
