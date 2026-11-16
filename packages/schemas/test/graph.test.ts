import { loadGraphDocumentText } from "face";
import { describe, expect, it } from "vitest";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const registry = buildRegistry();

function valid(value: unknown): boolean {
  const validator = validatorFor(registry, "graph@v0");
  if (validator === undefined) throw new Error("graph@v0 schema is unavailable");
  return validator(value);
}

describe("graph@v0: landing options", () => {
  it("accepts known environment failure names and keeps them in the graph reader", () => {
    const raw = [
      "interlock: graph@v0",
      "id: g",
      "known_environment_failures:",
      "  - packages/cli/test/codexGuard.test.ts",
      "nodes: []",
      "",
    ].join("\n");

    expect(
      valid({
        interlock: "graph@v0",
        id: "g",
        known_environment_failures: ["packages/cli/test/codexGuard.test.ts"],
        nodes: [],
      }),
    ).toBe(true);
    expect(loadGraphDocumentText(raw, "g.yaml")).toEqual({
      _tag: "Ok",
      value: {
        id: "g",
        knownEnvironmentFailures: ["packages/cli/test/codexGuard.test.ts"],
        gates: [],
        nodes: [],
      },
    });
  });

  it("refuses a non-list known environment failure field", () => {
    expect(
      loadGraphDocumentText(
        [
          "interlock: graph@v0",
          "id: g",
          "known_environment_failures: failure.ts",
          "nodes: []",
          "",
        ].join("\n"),
        "g.yaml",
      ),
    ).toEqual({
      _tag: "Err",
      error: {
        kind: "malformed-shape",
        path: "g.yaml",
        reason: '"known_environment_failures" must be a list of test file names',
      },
    });
  });
});
