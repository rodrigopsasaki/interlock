import { describe, expect, it } from "vitest";
import { buildRegistry, validatorFor } from "../src/registry.ts";

const validate = validatorFor(buildRegistry(), "runtimes@v2");

function schemaValid(value: unknown): boolean {
  if (validate === undefined) throw new Error("runtimes@v2 schema is unavailable");
  return validate(value) === true;
}

describe("runtimes@v2 schema", () => {
  it("validates an old catalogue without the new exec fields", () => {
    expect(
      schemaValid({
        interlock: "runtimes@v2",
        runtimes: { worker: { kind: "fake", model: "m", args: ["--prompt"] } },
      }),
    ).toBe(true);
  });

  it("validates a catalogue using every new exec field", () => {
    expect(
      schemaValid({
        interlock: "runtimes@v2",
        runtimes: {
          worker: {
            kind: "exec",
            model: "m",
            args: ["program", "{writable_roots}"],
            headless_args: ["--headless", "{prompt}"],
            writable_root_args: ["--root", "{path}"],
            mcp_servers: ["one", "two"],
            mcp_allow: ["one"],
            mcp_exclusive: {
              disable_all: ["--disable-all"],
              allow_each: ["--allow", "{name}"],
            },
            environment_passthrough: ["FORWARDED_NAME"],
            environment_forward_args: ["--forward", "{name}"],
          },
        },
      }),
    ).toBe(true);
  });

  it("refuses exclusive MCP combined with the legacy disable template", () => {
    expect(
      schemaValid({
        interlock: "runtimes@v2",
        runtimes: {
          worker: {
            kind: "exec",
            model: "m",
            mcp_disable_args: ["--disable", "{name}"],
            mcp_exclusive: {
              disable_all: ["--disable-all"],
              allow_each: ["--allow", "{name}"],
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("refuses an interlock marker in environment passthrough", () => {
    expect(
      schemaValid({
        interlock: "runtimes@v2",
        runtimes: {
          worker: {
            kind: "exec",
            model: "m",
            environment_passthrough: ["INTERLOCK_SESSION"],
          },
        },
      }),
    ).toBe(false);
  });
});
