import { describe, expect, it } from "vitest";
import { isMandate, type Mandate, mandateCovers } from "../src/mandate.js";

const mandate: Mandate = {
  grantedBy: "Rodrigo Sasaki",
  actionKind: "merge",
  context: "repo:interlock",
  notAfter: "2026-09-10T00:00:00Z",
  because: "in-flight bootstrap graph, standing merge authorization",
};

describe("mandate", () => {
  it("is a real, constructible record", () => {
    expect(isMandate(mandate)).toBe(true);
  });

  it("covers a matching kind, context and time", () => {
    expect(
      mandateCovers(mandate, {
        actionKind: "merge",
        context: "repo:interlock",
        now: "2026-09-09T23:00:00Z",
      }),
    ).toBe(true);
  });

  it("refuses a mismatched action kind", () => {
    expect(
      mandateCovers(mandate, {
        actionKind: "deploy",
        context: "repo:interlock",
        now: "2026-09-09T23:00:00Z",
      }),
    ).toBe(false);
  });

  it("refuses a mismatched context", () => {
    expect(
      mandateCovers(mandate, {
        actionKind: "merge",
        context: "repo:other",
        now: "2026-09-09T23:00:00Z",
      }),
    ).toBe(false);
  });

  it("an any context covers every context", () => {
    const anyMandate: Mandate = { ...mandate, context: "any" };
    expect(
      mandateCovers(anyMandate, {
        actionKind: "merge",
        context: "repo:other",
        now: "2026-09-09T23:00:00Z",
      }),
    ).toBe(true);
  });

  it("refuses once the time-frame has passed", () => {
    expect(
      mandateCovers(mandate, {
        actionKind: "merge",
        context: "repo:interlock",
        now: "2026-09-11T00:00:00Z",
      }),
    ).toBe(false);
  });
});
