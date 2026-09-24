import { err, ok, type Result } from "@phyxiusjs/fp";
import {
  DEFAULT_RUNTIME_NAME,
  type MergedRuntimes,
  type ResolvedRuntime,
} from "./runtimeCatalogue.ts";

export type RuntimeSelectionRefusal =
  | {
      readonly kind: "unknown-runtime";
      readonly requested: string;
      readonly known: readonly string[];
    }
  | {
      readonly kind: "no-runtime-resolvable";
      readonly known: readonly string[];
    };

export function explainRuntimeSelectionRefusal(
  refusal: RuntimeSelectionRefusal,
): string {
  const known =
    refusal.known.length === 0 ? "(none)" : refusal.known.join(", ");
  switch (refusal.kind) {
    case "unknown-runtime":
      return `"${refusal.requested}" is not a known runtime; known runtimes are ${known}.`;
    case "no-runtime-resolvable":
      return (
        "no runtime requested, local.yaml has no default_runtime, and no runtime is named " +
        `"${DEFAULT_RUNTIME_NAME}"; known runtimes are ${known}.`
      );
  }
}

// Resolution order, pinned by the graph's acceptance: the --runtime flag, then local.yaml's
// default_runtime, then the legacy runtime: block (which mergeRuntimes already names "default").
export function selectRuntime(
  merged: MergedRuntimes,
  requested: string | undefined,
): Result<ResolvedRuntime, RuntimeSelectionRefusal> {
  const known = [...merged.runtimes.keys()];

  if (requested !== undefined) {
    const found = merged.runtimes.get(requested);
    return found === undefined
      ? err({ kind: "unknown-runtime", requested, known })
      : ok(found);
  }

  if (merged.defaultRuntime !== undefined) {
    const found = merged.runtimes.get(merged.defaultRuntime);
    if (found !== undefined) return ok(found);
  }

  const legacy = merged.runtimes.get(DEFAULT_RUNTIME_NAME);
  if (legacy !== undefined) return ok(legacy);

  return err({ kind: "no-runtime-resolvable", known });
}
