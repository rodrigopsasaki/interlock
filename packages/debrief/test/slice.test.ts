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

const hypothesisItem: Item = {
  kind: "decision",
  statement: "The renderer is the shared context seam",
  because: "generated briefs and opening views use its output",
  scope: { kind: "path", path: "packages/debrief/src/slice.ts" },
  standing: "hypothesis",
  derivation: "agent:test-runtime:test-model",
};

const secondHypothesisItem: Item = {
  kind: "risk",
  statement: "A rendered receipt remains distinct from semantic truth",
  standing: "hypothesis",
  derivation: "agent:test-runtime:test-model",
};

const fixtureSliceRendered =
  "### Convention\n\n" +
  "- [ratified, repository] Conventional Commits, why-subjects and bodies\n" +
  "  derivation: substrate@v1 context\n\n" +
  "### Risk\n\n" +
  "- [observed, path .interlock/graphs/0002-shapes.yaml] Renaming the debrief package would stale " +
  "an approved graph's gate (because the brief-legacy gate filters on --filter debrief literally)\n" +
  "  derivation: substrate@v1 context\n\n" +
  "- A second, unrelated risk in the same kind\n" +
  "  derivation: substrate@v1 context";

describe("renderSlice", () => {
  it("says so in one sentence when the substrate address is none, regardless of items", () => {
    expect(renderSlice("none", [...fixtureSlice, hypothesisItem])).toBe(
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

  it("prepends one notice for hypothesis items without changing their rendering", () => {
    const rendered = renderSlice("local", [hypothesisItem]);
    expect(rendered).toBe(
      "Hypothesis items are unratified and must be checked against source before relying on them.\n\n" +
        "### Decision\n\n" +
        "- [hypothesis, path packages/debrief/src/slice.ts] The renderer is the shared context seam " +
        "(because generated briefs and opening views use its output)\n" +
        "  derivation: agent:test-runtime:test-model",
    );
  });

  it("prepends the notice once for multiple hypotheses while keeping kind order", () => {
    const rendered = renderSlice("local", [...fixtureSlice, hypothesisItem, secondHypothesisItem]);
    expect(rendered.match(/Hypothesis items are unratified/g)).toHaveLength(1);
    expect(rendered.indexOf("### Convention")).toBeGreaterThan(
      rendered.indexOf("Hypothesis items are unratified"),
    );
    expect(rendered.indexOf("### Decision")).toBeGreaterThan(rendered.indexOf("### Convention"));
    expect(rendered.indexOf("### Decision")).toBeLessThan(rendered.indexOf("### Risk"));
    expect(rendered).toContain(hypothesisItem.statement);
    expect(rendered).toContain(secondHypothesisItem.statement);
  });

  it("leaves a slice with observed, ratified, or absent standing unchanged", () => {
    expect(renderSlice("local", fixtureSlice)).toBe(fixtureSliceRendered);
  });

  it("renders an empty slice as no sections", () => {
    expect(renderSlice("local", [])).toBe("");
  });
});
