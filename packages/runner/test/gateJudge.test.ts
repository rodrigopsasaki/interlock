import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey, type Receipt } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "gate-"));
  writeFileSync(join(directory, "content.txt"), "hello\n");
  return directory;
}

const node = { graph: "fixture", id: "n1" };

describe("receipt-idempotent", () => {
  it("running the same gate twice over the same content writes one receipt identity and no duplicate fact", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const options = {
      ledger,
      clock: createControlledClock(),
      node,
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", "true"]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    };

    const first = await judgeGates(options);
    if (isErr(first)) throw new Error("expected an outcome");
    expect(first.value.kind).toBe("cleared");
    const afterFirst = ledger.projection().nodes.get(nodeKey(node));
    expect(afterFirst?.receipts).toHaveLength(1);
    const receiptId = afterFirst?.receipts[0]?.id;

    const second = await judgeGates(options);
    if (isErr(second)) throw new Error("expected an outcome");
    expect(second.value.kind).toBe("cleared");
    const afterSecond = ledger.projection().nodes.get(nodeKey(node));
    expect(afterSecond?.receipts).toHaveLength(1);
    expect(afterSecond?.receipts[0]?.id).toBe(receiptId);
  });
});

describe("gateJudge", () => {
  it("holds the node on a failing gate, with the failure and disposition recorded", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      declaredGateIds: ["always-fail"],
      commandFor: new Map([["always-fail", "false"]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    if (judged.value.kind !== "held") return;
    expect(judged.value.on).toEqual({
      kind: "gate-failure",
      failure: "always-fail",
      disposition: "hold",
    });
    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("always-fail")?.kind).toBe("blocked");
  });

  it("keeps a spent receipt instead of re-running it", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const keptReceipt: Receipt = {
      id: "kept",
      gate: "reviewed",
      commitSha: "deadbeef",
      spend: { kind: "local" },
      duration: { kind: "unknown" },
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      proof: {},
    };
    ledger.append({ kind: "receipt-written", node, receipt: keptReceipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "reviewed",
      to: { kind: "satisfied", receipt: keptReceipt },
    });

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      declaredGateIds: ["reviewed"],
      commandFor: new Map(),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.receipts).toHaveLength(1);
    expect(view?.receipts[0]?.id).toBe("kept");
  });

  it("cleared is decided only by this run's own gate execution; foreign gate receipts are ignored; spend other than none is kept", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const foreignReceipt: Receipt = {
      id: "foreign",
      gate: "foreign-none",
      commitSha: "deadbeef",
      spend: { kind: "none" },
      duration: { kind: "unknown" },
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      proof: {},
    };
    ledger.append({ kind: "receipt-written", node, receipt: foreignReceipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "foreign-none",
      to: { kind: "satisfied", receipt: foreignReceipt },
    });

    const keptReceipt: Receipt = {
      id: "kept",
      gate: "kept-local",
      commitSha: "deadbeef",
      spend: { kind: "local" },
      duration: { kind: "unknown" },
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      proof: {},
    };
    ledger.append({ kind: "receipt-written", node, receipt: keptReceipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "kept-local",
      to: { kind: "satisfied", receipt: keptReceipt },
    });

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      declaredGateIds: ["foreign-none", "kept-local"],
      commandFor: new Map([["foreign-none", "false"]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("foreign-none")?.kind).toBe("blocked");
    expect(view?.gates.get("kept-local")?.kind).toBe("satisfied");
    expect(
      view?.receipts.find((receipt) => receipt.gate === "kept-local")?.id,
    ).toBe("kept");
  });
});
