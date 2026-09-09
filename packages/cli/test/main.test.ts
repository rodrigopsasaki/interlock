import { describe, expect, it } from "vitest";
import { run } from "../src/main.ts";

describe("interlock debrief validate", () => {
  it("fails closed with a non-zero exit and a not-implemented message", () => {
    const result = run(["debrief", "validate"]);

    expect(result.exitCode).not.toBe(0);
    expect(result.message).toMatch(/not implemented/i);
  });
});

describe("an unknown command", () => {
  it("also fails closed rather than exiting quietly", () => {
    const result = run(["graph", "status"]);

    expect(result.exitCode).not.toBe(0);
  });
});
