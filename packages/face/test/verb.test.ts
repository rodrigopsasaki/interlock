import { describe, expect, it } from "vitest";
import { type Verb, verbCommand, verbNeedsAccountability } from "../src/verb.ts";

describe("verbNeedsAccountability", () => {
  it("names exactly the four verbs whose CLI subcommand requires --by and --because", () => {
    expect(verbNeedsAccountability("approve")).toBe(true);
    expect(verbNeedsAccountability("cancel")).toBe(true);
    expect(verbNeedsAccountability("reset")).toBe(true);
    expect(verbNeedsAccountability("waive")).toBe(true);
    expect(verbNeedsAccountability("run")).toBe(false);
    expect(verbNeedsAccountability("judge")).toBe(false);
    expect(verbNeedsAccountability("sweep")).toBe(false);
    expect(verbNeedsAccountability("backfill")).toBe(false);
  });
});

describe("verbCommand", () => {
  it("builds each verb's argv exactly as main.ts's own group/action dispatch expects it", () => {
    const accountable = { by: "rodrigo", because: "because I said so" };
    const cases: readonly [Verb, readonly string[]][] = [
      [{ kind: "approve", graph: "g1" }, ["graph", "approve", "g1"]],
      [{ kind: "run", graph: "g1", node: "n1" }, ["run", "g1", "n1"]],
      [{ kind: "judge", graph: "g1", node: "n1" }, ["judge", "g1", "n1"]],
      [{ kind: "cancel", graph: "g1", node: "n1" }, ["node", "cancel", "g1", "n1"]],
      [{ kind: "reset", graph: "g1", node: "n1" }, ["node", "reset", "g1", "n1"]],
      [
        { kind: "waive", graph: "g1", node: "n1", gate: "typecheck" },
        ["gate", "waive", "g1", "n1", "typecheck"],
      ],
      [{ kind: "sweep" }, ["sweep"]],
      [{ kind: "backfill", graph: "g1" }, ["backfill", "g1"]],
    ];

    for (const [verb, base] of cases) {
      expect(verbCommand(verb)).toEqual(base);
    }

    expect(verbCommand({ kind: "approve", graph: "g1" }, accountable)).toEqual([
      "graph",
      "approve",
      "g1",
      "--by",
      "rodrigo",
      "--because",
      "because I said so",
    ]);
  });

  it("never appends --by/--because to a verb whose CLI subcommand does not accept them, even when accountable is supplied", () => {
    const accountable = { by: "rodrigo", because: "because I said so" };
    expect(verbCommand({ kind: "run", graph: "g1", node: "n1" }, accountable)).toEqual([
      "run",
      "g1",
      "n1",
    ]);
    expect(verbCommand({ kind: "sweep" }, accountable)).toEqual(["sweep"]);
  });
});
