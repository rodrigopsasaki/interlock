import { runtimeAttribution, type SessionRuntime } from "ledger";

export function renderSessionRuntime(runtime: SessionRuntime): string {
  const attribution = runtimeAttribution(runtime);
  const choice = attribution.chosenBy;
  const reason = "because" in choice ? ` (${choice.because})` : "";
  const profile =
    runtime === "unknown"
      ? "unknown"
      : `${runtime.name} (${runtime.kind}, ${runtime.model ?? "model undeclared"})`;
  return `${profile}, provider ${attribution.provider}, chosen-by ${choice.kind}${reason}`;
}
