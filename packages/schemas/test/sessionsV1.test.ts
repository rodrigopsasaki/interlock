import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();
const validate = registry.ajv.getSchema(
  "https://github.com/rodrigopsasaki/interlock/schemas/sessions@v1.json",
);

const document = {
  interlock: "sessions@v1",
  state: "partial",
  count: 2,
  sessions: [
    {
      id: "exec-session",
      repository: "/repo",
      graph: "graph",
      node: "node",
      kind: "node",
      transport: "exec",
      runtime: "fixture",
      pid: 42,
      phase: "work",
      phaseId: "work",
      liveness: "live",
    },
    {
      id: "pane",
      repository: null,
      graph: null,
      node: null,
      kind: null,
      transport: "pane",
      runtime: "unknown",
      pid: null,
      phase: null,
      phaseId: null,
      liveness: "live",
    },
  ],
  sources: {
    repositories: { state: "read" },
    herdr: { state: "unreadable", because: "socket absent" },
  },
};

describe("sessions@v1", () => {
  it("publishes and validates the cross-repository live-session envelope", () => {
    expect(
      readFileSync(join(import.meta.dirname, "../../../schemas/sessions@v1.json"), "utf8"),
    ).toContain('"const": "sessions@v1"');
    expect(validate?.(document), JSON.stringify(validate?.errors)).toBe(true);
  });

  it("requires the count and source states", () => {
    const missingCount = { ...document, count: undefined };
    const missingSources = { ...document, sources: undefined };
    expect(validate?.(missingCount)).toBe(false);
    expect(validate?.(missingSources)).toBe(false);
  });
});
