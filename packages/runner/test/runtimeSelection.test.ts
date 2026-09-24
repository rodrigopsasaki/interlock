import { isErr, isOk } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import type { MergedRuntimes, ResolvedRuntime } from "../src/runtimeCatalogue.ts";
import { explainRuntimeSelectionRefusal, selectRuntime } from "../src/runtimeSelection.ts";

function runtimeNamed(name: string, source: ResolvedRuntime["source"]): ResolvedRuntime {
  return {
    name,
    kind: "claude",
    args: [],
    model: undefined,
    startupAnswers: [],
    startupTimeoutMs: 60_000,
    source,
  };
}

function merged(
  entries: readonly ResolvedRuntime[],
  defaultRuntime: string | undefined = undefined,
): MergedRuntimes {
  return {
    runtimes: new Map(entries.map((entry) => [entry.name, entry])),
    defaultRuntime,
  };
}

describe("selectRuntime: resolution order is flag, then default_runtime, then legacy default", () => {
  it("the --runtime flag wins even when a default_runtime and a legacy default both exist", () => {
    const luna = runtimeNamed("luna", "catalogue");
    const fast = runtimeNamed("fast", "catalogue");
    const legacy = runtimeNamed("default", "local.yaml");
    const view = merged([luna, fast, legacy], "fast");

    const result = selectRuntime(view, "luna");

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(luna);
  });

  it("local.yaml's default_runtime wins over the legacy default when no flag is given", () => {
    const fast = runtimeNamed("fast", "catalogue");
    const legacy = runtimeNamed("default", "local.yaml");
    const view = merged([fast, legacy], "fast");

    const result = selectRuntime(view, undefined);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(fast);
  });

  it("falls back to the runtime named default (the legacy runtime: block) with no flag and no default_runtime", () => {
    const legacy = runtimeNamed("default", "local.yaml");
    const view = merged([legacy]);

    const result = selectRuntime(view, undefined);

    expect(isOk(result)).toBe(true);
    if (isOk(result)) expect(result.value).toBe(legacy);
  });
});

describe("selectRuntime: refusals", () => {
  it("an unknown requested name refuses with a sentence listing the known names", () => {
    const view = merged([runtimeNamed("fast", "catalogue"), runtimeNamed("default", "local.yaml")]);

    const result = selectRuntime(view, "nope");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({
      kind: "unknown-runtime",
      requested: "nope",
      known: ["fast", "default"],
    });
    const message = explainRuntimeSelectionRefusal(result.error);
    expect(message).toContain('"nope"');
    expect(message).toContain("fast");
    expect(message).toContain("default");
  });

  it("no name resolvable at all refuses naming what was looked for, even with an empty catalogue", () => {
    const view = merged([]);

    const result = selectRuntime(view, undefined);

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toEqual({ kind: "no-runtime-resolvable", known: [] });
    expect(explainRuntimeSelectionRefusal(result.error)).toContain("(none)");
  });

  it("an unknown requested name against an empty catalogue still names what exists (none)", () => {
    const view = merged([]);

    const result = selectRuntime(view, "luna");

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(explainRuntimeSelectionRefusal(result.error)).toContain("(none)");
  });
});
