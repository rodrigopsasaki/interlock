import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";

describe("Codex guard leak fixture", () => {
  it("starts the fixture Codex", () => {
    execFileSync("codex", ["exec", "fixture"], {
      env: process.env,
      encoding: "utf8",
    });
  });
});
