import { type Item, renderSlice } from "debrief";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const items: readonly Item[] = [
  {
    kind: "convention",
    statement: "Conventional Commits, why-subjects and bodies",
    scope: { kind: "repository" },
    standing: "ratified",
    derivation: "substrate@v1 context",
  },
  {
    kind: "risk",
    statement: "Renaming the debrief package would stale an approved graph's gate",
    because: "the brief-legacy gate filters on --filter debrief literally",
    scope: { kind: "path", path: ".interlock/graphs/0002-shapes.yaml" },
    standing: "observed",
    derivation: "substrate@v1 context",
  },
  {
    kind: "risk",
    statement: "A second, unrelated risk in the same kind",
    derivation: "substrate@v1 context",
  },
];

describe("corpus: item@v1, the substrate slice's own item shape", () => {
  const registry = buildRegistry();
  const validate = registry.ajv.getSchema(
    "https://github.com/rodrigopsasaki/interlock/schemas/item@v1.json",
  );

  for (const item of items) {
    it(`validates ${item.kind}: ${item.statement.slice(0, 30)}`, () => {
      expect(validate?.(item), JSON.stringify(validate?.errors)).toBe(true);
    });
  }

  it("renders a slice from these same items, confirming they are the real shape", () => {
    const rendered = renderSlice("local", items);
    expect(rendered).toContain("Conventional Commits");
  });

  it("refuses an item with an out-of-union kind", () => {
    const value = { kind: "belief", statement: "x", derivation: "y" };
    expect(validate?.(value)).toBe(false);
  });
});
