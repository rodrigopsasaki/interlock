import { isErr } from "@phyxiusjs/fp";
import type { GateDeclaration } from "face";
import { describe, expect, it } from "vitest";
import {
  declaredGateIds,
  gateCommandTable,
  substituteGateCommand,
} from "../src/gateCommand.ts";
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

describe("substituteGateCommand", () => {
  const node = { graph: "0001-bootstrap", id: "debrief-schema" };

  it("fills in {graph} and {node}", () => {
    const substituted = substituteGateCommand(
      "pnpm interlock debrief validate {graph} {node}",
      node,
    );
    expect(isErr(substituted)).toBe(false);
    if (isErr(substituted)) return;
    expect(substituted.value).toBe(
      "pnpm interlock debrief validate 0001-bootstrap debrief-schema",
    );
  });

  it("leaves a command with no placeholders untouched", () => {
    const substituted = substituteGateCommand("pnpm typecheck", node);
    expect(isErr(substituted)).toBe(false);
    if (isErr(substituted)) return;
    expect(substituted.value).toBe("pnpm typecheck");
  });

  it("refuses an unknown placeholder, naming it", () => {
    const substituted = substituteGateCommand("pnpm run {branch}", node);
    expect(isErr(substituted)).toBe(true);
    if (!isErr(substituted)) return;
    expect(substituted.error).toEqual({
      kind: "unknown-placeholder",
      token: "branch",
      command: "pnpm run {branch}",
    });
  });
});
