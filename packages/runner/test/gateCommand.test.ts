import { isErr } from "@phyxiusjs/fp";
import type { GateDeclaration } from "face";
import { describe, expect, it } from "vitest";
import { declaredGateIds, gateCommandTable, substituteGateCommand } from "../src/gateCommand.ts";
import type { StandingGate } from "../src/standingGates.ts";

describe("gateCommand", () => {
  it("standing gates come before the node's own", () => {
    const standing: readonly StandingGate[] = [
      { id: "typecheck", kind: "command", run: "pnpm typecheck" },
    ];
    const node: readonly GateDeclaration[] = [
      { id: "reviewed", kind: "command", run: "pnpm review" },
    ];

    expect(declaredGateIds(standing, node)).toEqual(["typecheck", "reviewed"]);
    expect([...gateCommandTable(standing, node).keys()]).toEqual(["typecheck", "reviewed"]);
  });

  it("carries a standing gate's expect_output pattern into its command entry", () => {
    const standing: readonly StandingGate[] = [
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: /Tests +[1-9][0-9]* passed/,
      },
    ];

    const table = gateCommandTable(standing, []);
    expect(table.get("test")).toEqual({
      kind: "command",
      run: "pnpm test",
      expectOutput: /Tests +[1-9][0-9]* passed/,
    });
  });

  it("carries a node gate's own expect_output pattern, overriding the standing entry's", () => {
    const standing: readonly StandingGate[] = [
      {
        id: "test",
        kind: "command",
        run: "pnpm test",
        expectOutput: /standing pattern/,
      },
    ];
    const node: readonly GateDeclaration[] = [
      {
        id: "test",
        kind: "command",
        run: "pnpm --filter runner test",
        expectOutput: /Tests +[1-9][0-9]* passed/,
      },
    ];

    const table = gateCommandTable(standing, node);
    expect(table.get("test")).toEqual({
      kind: "command",
      run: "pnpm --filter runner test",
      expectOutput: /Tests +[1-9][0-9]* passed/,
    });
  });

  it("omits expect_output from a command entry when no pattern was declared", () => {
    const standing: readonly StandingGate[] = [
      { id: "typecheck", kind: "command", run: "pnpm typecheck" },
    ];

    const table = gateCommandTable(standing, []);
    expect(table.get("typecheck")).toEqual({
      kind: "command",
      run: "pnpm typecheck",
    });
    expect(table.get("typecheck")).not.toHaveProperty("expectOutput");
  });

  it("carries a node's human gate into the table with no run, distinct from a command gate", () => {
    const node: readonly GateDeclaration[] = [{ id: "witnessed", kind: "human" }];

    const table = gateCommandTable([], node);
    expect(table.get("witnessed")).toEqual({ kind: "human" });
    expect(table.get("witnessed")).not.toHaveProperty("run");
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
    expect(substituted.value).toBe("pnpm interlock debrief validate 0001-bootstrap debrief-schema");
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
