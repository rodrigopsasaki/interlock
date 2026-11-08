import { isErr } from "@phyxiusjs/fp";
import { describe, expect, it } from "vitest";
import { derivation } from "../src/derivation.ts";
import { envelopeFor } from "../src/envelope.ts";
import { gate } from "../src/gate.ts";
import { nodeKey } from "../src/graph.ts";
import { assessReceipt, duration, type Receipt } from "../src/receipt.ts";
import { replayFromRaw } from "../src/replay.ts";
import { spend } from "../src/spend.ts";

const node = { graph: "fixture", id: "n1" };

function receipt(
  id: string,
  gateId: string,
  proof: Readonly<Record<string, unknown>>,
  receiptDerivation = derivation.gate(gateId, "runner@0", "runner"),
): Receipt {
  return {
    id,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: receiptDerivation,
    proof,
  };
}

describe("collided command receipts", () => {
  it("replays every event and assesses mismatched command proofs without judging other receipts", () => {
    const failing = receipt("same-id", "proof", { exitCode: 1, outputHash: "fail" });
    const outputMismatch = receipt("pattern-id", "pattern", {
      exitCode: 0,
      outputHash: "output",
      outputMatched: false,
      pattern: "Tests +[1-9][0-9]* passed",
    });
    const human = receipt(
      "human-id",
      "human",
      { because: "Rodrigo cleared this" },
      derivation.human("Rodrigo Sasaki"),
    );
    const legacy = receipt("legacy-id", "legacy", {});
    const events = [
      { kind: "node-created" as const, node },
      { kind: "receipt-written" as const, node, receipt: failing },
      {
        kind: "gate-moved" as const,
        node,
        gate: "proof",
        to: gate.blocked("exit 1", "proof failed"),
      },
      { kind: "gate-moved" as const, node, gate: "proof", to: gate.satisfied(failing) },
      { kind: "receipt-written" as const, node, receipt: outputMismatch },
      { kind: "gate-moved" as const, node, gate: "pattern", to: gate.satisfied(outputMismatch) },
      { kind: "receipt-written" as const, node, receipt: human },
      { kind: "gate-moved" as const, node, gate: "human", to: gate.satisfied(human) },
      { kind: "receipt-written" as const, node, receipt: legacy },
      { kind: "gate-moved" as const, node, gate: "legacy", to: gate.satisfied(legacy) },
    ];
    const replayed = replayFromRaw(
      events.map((event) => JSON.stringify(envelopeFor(event))).join("\n"),
    );
    expect(isErr(replayed)).toBe(false);
    if (isErr(replayed)) return;

    const view = replayed.value.nodes.get(nodeKey(node));
    expect(view?.receipts).toHaveLength(4);
    expect(view?.gates.get("proof")).toEqual(gate.satisfied(failing));
    expect(assessReceipt(failing)).toEqual({ kind: "failed", because: "exit 1" });
    expect(assessReceipt(outputMismatch)).toEqual({
      kind: "failed",
      because: "output did not match /Tests +[1-9][0-9]* passed/",
    });
    expect(assessReceipt(human)).toEqual({ kind: "not-recorded" });
    expect(assessReceipt(legacy)).toEqual({ kind: "not-recorded" });
  });
});
