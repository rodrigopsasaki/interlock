import { describe, expect, it } from "vitest";
import { buildRegistry } from "../src/registry.ts";

const registry = buildRegistry();
const validate = registry.ajv.getSchema(
  "https://github.com/rodrigopsasaki/interlock/schemas/runtimes@v0.json",
);

function schemaValid(value: unknown): boolean {
  if (validate === undefined) throw new Error("runtimes@v0 schema is unavailable");
  return validate(value) === true;
}

function catalogueWith(runtimes: unknown): unknown {
  return { interlock: "runtimes@v0", runtimes };
}

describe("runtimes@v0 schema", () => {
  it("is registered under its own tag", () => {
    expect(registry.tags.has("runtimes@v0")).toBe(true);
  });

  it("accepts a document with no runtimes key at all", () => {
    expect(schemaValid({ interlock: "runtimes@v0" })).toBe(true);
  });

  it("accepts an empty runtimes mapping", () => {
    expect(schemaValid(catalogueWith({}))).toBe(true);
  });

  it("accepts a well-formed entry with only the required fields", () => {
    expect(
      schemaValid(
        catalogueWith({
          fast: { kind: "claude", model: "fast-model-label" },
        }),
      ),
    ).toBe(true);
  });

  it("accepts a well-formed entry with every optional field", () => {
    expect(
      schemaValid(
        catalogueWith({
          careful: {
            kind: "codex",
            args: ["--flag"],
            model: "careful-model-label",
            startup_answers: [{ matches: "ready?", keys: ["Enter"] }],
            startup_timeout_ms: 15000,
            prompt_taken_timeout_ms: 5000,
            ready_settle_ms: 3000,
            prompt_retries: 4,
          },
        }),
      ),
    ).toBe(true);
  });

  it("accepts ready_settle_ms and prompt_retries at 0", () => {
    expect(
      schemaValid(
        catalogueWith({
          fast: {
            kind: "claude",
            model: "m",
            ready_settle_ms: 0,
            prompt_retries: 0,
          },
        }),
      ),
    ).toBe(true);
  });

  it.each([
    ["a name with an uppercase letter", { Fast: { kind: "claude", model: "m" } }],
    ["a name starting with a digit", { "1fast": { kind: "claude", model: "m" } }],
    ["an entry missing kind", { fast: { model: "m" } }],
    ["an entry missing model", { fast: { kind: "claude" } }],
    [
      "a non-integer startup_timeout_ms",
      { fast: { kind: "claude", model: "m", startup_timeout_ms: 1.5 } },
    ],
    [
      "a non-positive startup_timeout_ms",
      { fast: { kind: "claude", model: "m", startup_timeout_ms: 0 } },
    ],
    [
      "a non-integer prompt_taken_timeout_ms",
      { fast: { kind: "claude", model: "m", prompt_taken_timeout_ms: 1.5 } },
    ],
    [
      "a non-positive prompt_taken_timeout_ms",
      { fast: { kind: "claude", model: "m", prompt_taken_timeout_ms: 0 } },
    ],
    ["a negative ready_settle_ms", { fast: { kind: "claude", model: "m", ready_settle_ms: -1 } }],
    [
      "a non-integer ready_settle_ms",
      { fast: { kind: "claude", model: "m", ready_settle_ms: 1.5 } },
    ],
    ["a negative prompt_retries", { fast: { kind: "claude", model: "m", prompt_retries: -1 } }],
    ["a non-integer prompt_retries", { fast: { kind: "claude", model: "m", prompt_retries: 1.5 } }],
    ["args that are not strings", { fast: { kind: "claude", model: "m", args: [1] } }],
  ])("refuses %s", (_name, runtimes) => {
    expect(schemaValid(catalogueWith(runtimes))).toBe(false);
  });

  it("refuses the wrong shape tag", () => {
    expect(schemaValid({ interlock: "runtimes@v9" })).toBe(false);
  });
});
