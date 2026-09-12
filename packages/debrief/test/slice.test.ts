import { describe, expect, it } from "vitest";
import { type Item, renderSlice } from "../src/slice.ts";

const fixtureSlice: readonly Item[] = [
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

describe("renderSlice", () => {
  it("says so in one sentence when the substrate address is none, regardless of items", () => {
    expect(renderSlice("none", fixtureSlice)).toBe(
      "No substrate is configured; this brief carries no context slice.",
    );
    expect(renderSlice("none", [])).toBe(
      "No substrate is configured; this brief carries no context slice.",
    );
  });

  it("groups items into one section per kind, in a fixed order", () => {
    const rendered = renderSlice("local", fixtureSlice);
    expect(rendered.indexOf("### Convention")).toBeGreaterThanOrEqual(0);
    expect(rendered.indexOf("### Risk")).toBeGreaterThan(rendered.indexOf("### Convention"));
    expect(rendered).not.toContain("### Decision");
  });

  it("renders each item as a bullet whose last line names its derivation", () => {
    const rendered = renderSlice("local", fixtureSlice);
    const lines = rendered.split("\n");
    const derivationLines = lines.filter((line) => line.trim().startsWith("derivation:"));
    expect(derivationLines).toHaveLength(fixtureSlice.length);
    for (const line of derivationLines) {
      expect(line.trim()).toBe("derivation: substrate@v1 context");
    }
  });

  it("carries provenance: because, scope and standing appear beside the statement", () => {
    const rendered = renderSlice("local", fixtureSlice);
    expect(rendered).toContain(
      "[observed, path .interlock/graphs/0002-shapes.yaml] Renaming the debrief package would stale an approved graph's gate (because the brief-legacy gate filters on --filter debrief literally)",
    );
  });

  it("renders an empty slice as no sections", () => {
    expect(renderSlice("local", [])).toBe("");
  });
});
