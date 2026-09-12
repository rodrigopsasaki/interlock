import { derivation } from "ledger";
import { describe, expect, it } from "vitest";
import {
  debriefDerivationString,
  derivationString,
} from "../src/derivationString.ts";

describe("derivationString", () => {
  it("renders a gate derivation as gate:<gate>:<version>:<runner>", () => {
    expect(
      derivationString(derivation.gate("typecheck", "runner@0", "run-1")),
    ).toBe("gate:typecheck:runner@0:run-1");
  });

  it("renders a model derivation as model:<model>:<promptId>:<lens>", () => {
    expect(
      derivationString(
        derivation.model("claude-sonnet-5", "review@1", "correctness"),
      ),
    ).toBe("model:claude-sonnet-5:review@1:correctness");
  });

  it("renders a human derivation as human:<who>", () => {
    expect(derivationString(derivation.human("Rodrigo Sasaki"))).toBe(
      "human:Rodrigo Sasaki",
    );
  });
});

describe("debriefDerivationString", () => {
  it("renders an agent debrief derivation as agent:<runtime>:<model>", () => {
    expect(
      debriefDerivationString({
        kind: "agent",
        runtime: "claude-code",
        model: "claude-sonnet-5",
      }),
    ).toBe("agent:claude-code:claude-sonnet-5");
  });

  it("renders a human debrief derivation as human:<who>", () => {
    expect(
      debriefDerivationString({ kind: "human", who: "Rodrigo Sasaki" }),
    ).toBe("human:Rodrigo Sasaki");
  });
});
