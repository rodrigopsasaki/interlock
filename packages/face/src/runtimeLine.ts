import type { SessionRuntime } from "ledger";

export function renderSessionRuntime(runtime: SessionRuntime): string {
  if (runtime === "unknown") return "unknown";
  return `${runtime.name} (${runtime.kind}, ${runtime.model ?? "model undeclared"})`;
}
