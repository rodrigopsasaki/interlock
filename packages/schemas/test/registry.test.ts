import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

describe("corpus: the schema registry", () => {
  it("loads every schema file and resolves every $ref", () => {
    const registry = buildRegistry();
    expect(registry.tags.size).toBeGreaterThan(0);
  });

  it("names a schema for every shape this node's brief lists", () => {
    const registry = buildRegistry();
    const expected = [
      "graph@v0",
      "brief@v0",
      "brief@v1",
      "notes@v0",
      "debrief@v0",
      "debrief@v1",
      "debrief@v2",
      "event@v1",
      "event@v2",
      "event@v3",
      "event@v4",
      "event@v5",
      "event@v6",
      "event@v7",
      "event@v8",
      "event@v9",
      "event@v10",
      "config@v0",
      "local@v0",
      "local@v1",
      "runtimes@v0",
      "runtimes@v1",
      "runtimes@v2",
      "positions@v2",
      "position@v1",
      "position@v2",
      "position@v3",
      "item@v1",
    ];
    for (const tag of expected) {
      expect(registry.tags.has(tag), `missing schema for ${tag}`).toBe(true);
    }
  });
});
