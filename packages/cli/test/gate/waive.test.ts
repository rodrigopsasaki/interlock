import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import {
  createLedger,
  createReceipt,
  derivation,
  duration,
  gate,
  type Ledger,
  type Receipt,
  spend,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runGateWaive } from "../../src/gate/waive.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "    gates:",
  "      - id: own-gate",
  "        kind: command",
  '        run: "true"',
  "",
].join("\n");

const configYaml = [
  "interlock: config@v0",
  "standing_gates:",
  "  - id: typecheck",
  "    kind: command",
  '    run: "true"',
  "",
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "gate-waive-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(join(directory, ".interlock", "config.yaml"), configYaml);
  return directory;
}

async function openLedger(cwd: string): Promise<Ledger> {
  return unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: sharedJournalDirectory(cwd),
    }),
  );
}

async function writeReceipt(cwd: string, gateId: string): Promise<Receipt> {
  return unwrap(
    await createReceipt(
      cwd,
      [],
      gateId,
      "deadbeef",
      spend.none(),
      duration.unknown(),
      derivation.gate(gateId, "1", "runner"),
      {},
    ),
  );
}

function journalEventKinds(cwd: string): readonly string[] {
  const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): string => {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null && "kind" in parsed
        ? String(parsed["kind"])
        : "";
    });
}

describe("gate waive", () => {
  it("refuses without --because", async () => {
    const cwd = fixture();
    const result = await runGateWaive(["demo", "a", "typecheck", "--by", "Rodrigo Sasaki"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock gate waive: refuses without --because; every waiver records why.",
    );
  });

  it("refuses without --by", async () => {
    const cwd = fixture();
    const result = await runGateWaive(
      ["demo", "a", "typecheck", "--because", "known flaky suite"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock gate waive: refuses without --by; every waiver records who.",
    );
  });

  it("refuses on an unknown graph", async () => {
    const cwd = fixture();
    const result = await runGateWaive(
      ["ghost", "a", "typecheck", "--by", "Rodrigo Sasaki", "--because", "flaky"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses on an unknown node", async () => {
    const cwd = fixture();
    const result = await runGateWaive(
      ["demo", "ghost", "typecheck", "--by", "Rodrigo Sasaki", "--because", "flaky"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('no node "ghost" declared on graph "demo"');
  });

  it("refuses on an unknown gate", async () => {
    const cwd = fixture();
    const result = await runGateWaive(
      ["demo", "a", "ghost-gate", "--by", "Rodrigo Sasaki", "--because", "flaky"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      'a: gate "ghost-gate" is not declared; declared gates are typecheck, own-gate.',
    );
  });

  it("refuses a gate with no receipt, naming that a waiver needs something to waive", async () => {
    const cwd = fixture();
    const result = await runGateWaive(
      ["demo", "a", "typecheck", "--by", "Rodrigo Sasaki", "--because", "flaky"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "a/typecheck: no receipt to waive; a waiver needs something to waive.",
    );
  });

  it("waives a gate over its latest receipt", async () => {
    const cwd = fixture();
    const receipt = await writeReceipt(cwd, "typecheck");
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "receipt-written",
      node: { graph: "demo", id: "a" },
      receipt,
    });
    ledger.append({
      kind: "gate-moved",
      node: { graph: "demo", id: "a" },
      gate: "typecheck",
      to: gate.blocked(`receipt ${receipt.id}, exit 1`, "typecheck: exit 1"),
    });
    await ledger.close();

    const result = await runGateWaive(
      ["demo", "a", "typecheck", "--by", "Rodrigo Sasaki", "--because", "known flaky suite"],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(`a/typecheck: waived by Rodrigo Sasaki (receipt ${receipt.id}).`);
    expect(journalEventKinds(cwd)).toEqual(["receipt-written", "gate-moved", "gate-moved"]);
  });

  it("refuses to waive a gate already waived, naming the terminal rule", async () => {
    const cwd = fixture();
    const receipt = await writeReceipt(cwd, "typecheck");
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "receipt-written",
      node: { graph: "demo", id: "a" },
      receipt,
    });
    ledger.append({
      kind: "gate-moved",
      node: { graph: "demo", id: "a" },
      gate: "typecheck",
      to: gate.waived("Rodrigo Sasaki", "known flaky suite", receipt),
    });
    await ledger.close();

    const result = await runGateWaive(
      ["demo", "a", "typecheck", "--by", "Rodrigo Sasaki", "--because", "waiving again"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe("a/typecheck: cannot move from waived, which is terminal.");
  });
});
