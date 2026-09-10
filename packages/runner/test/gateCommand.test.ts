import type { GateDeclaration } from "face";
import { describe, expect, it } from "vitest";
import { declaredGateIds, gateCommandTable } from "../src/gateCommand.ts";
import type { StandingGate } from "../src/standingGates.ts";

describe("gateCommand", () => {
  it("standing gates come before the node's own", () => {
    const standing: readonly StandingGate[] = [
      { id: "typecheck", run: "pnpm typecheck" },
    ];
    const node: readonly GateDeclaration[] = [
      { id: "reviewed", kind: "command", run: "pnpm review" },
    ];

    expect(declaredGateIds(standing, node)).toEqual(["typecheck", "reviewed"]);
    expect([...gateCommandTable(standing, node).keys()]).toEqual([
      "typecheck",
      "reviewed",
    ]);
  });
});
