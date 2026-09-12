import { describe, expect, it } from "vitest";
import { derivation, isDerivation } from "../src/derivation.js";

describe("derivation", () => {
  it("builds gate, model and human", () => {
    expect(derivation.gate("typecheck", "1.0.0", "runner-command-gate")).toEqual({
      kind: "gate",
      gate: "typecheck",
      version: "1.0.0",
      runner: "runner-command-gate",
    });
    expect(derivation.model("claude-sonnet-5", "verifier:hunk@v1", "verifier:lens@v1")).toEqual({
      kind: "model",
      model: "claude-sonnet-5",
      promptId: "verifier:hunk@v1",
      lens: "verifier:lens@v1",
    });
    expect(derivation.human("Rodrigo Sasaki")).toEqual({
      kind: "human",
      who: "Rodrigo Sasaki",
    });
  });

  it("recognizes every closed arm", () => {
    expect(isDerivation(derivation.gate("g", "v", "r"))).toBe(true);
    expect(isDerivation(derivation.model("m", "p", "l"))).toBe(true);
    expect(isDerivation(derivation.human("a person"))).toBe(true);
  });

  it("rejects a kind outside the closed set", () => {
    expect(isDerivation({ kind: "vendor" })).toBe(false);
  });
});
