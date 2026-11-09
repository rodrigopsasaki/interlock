import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock, ms } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { type GateCommandRunner, judgeGates } from "../src/gateJudge.ts";
import { memoryLedgerWithLog } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const node = { graph: "fixture", id: "n1" };
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "receipt-run-"));
  writeFileSync(join(directory, "content.txt"), "content\n");
  return directory;
}

async function judge(
  root: string,
  ledger: ReturnType<typeof memoryLedgerWithLog>["ledger"],
  clock: ReturnType<typeof createControlledClock>,
  commandRunner: GateCommandRunner,
  run: string,
  expectOutput?: RegExp,
) {
  const judged = await judgeGates({
    ledger,
    clock,
    node,
    session: "s1",
    declaredGateIds: ["proof"],
    commandFor: new Map([
      ["proof", { kind: "command", run, ...(expectOutput === undefined ? {} : { expectOutput }) }],
    ]),
    worktree: root,
    scopeRoot: root,
    scopePaths: ["content.txt"],
    commitSha: "deadbeef",
    runnerId: "runner",
    holdMs: 60_000,
    substrate: noneClient(),
    env: {},
    commandRunner,
    outputDirectory: join(root, "output"),
    narrate: () => {},
  });
  if (isErr(judged)) throw new Error("expected an outcome");
  return judged.value;
}

function result(
  exitCode: number,
  output: string,
): {
  readonly exitCode: number;
  readonly output: string;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
} {
  return { exitCode, output, stdout: Buffer.from(output), stderr: Buffer.alloc(0) };
}

describe("command receipt identity", () => {
  it("keeps a pass and a fail on distinct receipts and points at the pass", async () => {
    const root = fixture();
    const { ledger, events } = memoryLedgerWithLog();
    const clock = createControlledClock({ initialTime: 0 });
    let calls = 0;
    const commandRunner: GateCommandRunner = async () => {
      calls += 1;
      clock.advanceBy(ms(calls));
      return calls === 1 ? result(1, "fail") : result(0, "pass");
    };

    expect((await judge(root, ledger, clock, commandRunner, "fixture --proof")).kind).toBe("held");
    expect((await judge(root, ledger, clock, commandRunner, "fixture --proof")).kind).toBe(
      "cleared",
    );

    const view = ledger.projection().nodes.get(nodeKey(node));
    const proofGate = view?.gates.get("proof");
    expect(proofGate?.kind).toBe("satisfied");
    if (proofGate?.kind === "satisfied") {
      expect(proofGate.receipt.proof["exitCode"]).toBe(0);
    }
    expect(view?.receipts).toHaveLength(2);
    expect(events.filter((event) => event.kind === "receipt-written")).toHaveLength(2);
  });

  it("points at the failing receipt after a pass and then a fail", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();
    const clock = createControlledClock({ initialTime: 0 });
    let calls = 0;
    const commandRunner: GateCommandRunner = async () => {
      calls += 1;
      clock.advanceBy(ms(calls));
      return calls === 1 ? result(0, "pass") : result(1, "fail");
    };

    expect((await judge(root, ledger, clock, commandRunner, "fixture --proof")).kind).toBe(
      "cleared",
    );
    expect((await judge(root, ledger, clock, commandRunner, "fixture --proof")).kind).toBe("held");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("proof")?.kind).toBe("blocked");
    expect(view?.receipts).toHaveLength(2);
  });

  it("reuses identical proof while ignoring different durations", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();
    const clock = createControlledClock({ initialTime: 0 });
    let calls = 0;
    const commandRunner: GateCommandRunner = async (argv) => {
      calls += 1;
      clock.advanceBy(ms(calls * 10));
      expect(argv).toEqual(["mise", "exec", "--", "fixture", "--proof"]);
      return result(0, "same");
    };

    await judge(root, ledger, clock, commandRunner, "fixture --proof");
    await judge(root, ledger, clock, commandRunner, "fixture --proof");

    expect(calls).toBe(2);
    expect(ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(1);
  });

  it("includes output matching and stream references in command identity", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();
    const clock = createControlledClock({ initialTime: 0 });
    const commandRunner: GateCommandRunner = async () => {
      clock.advanceBy(ms(1));
      return result(0, "same");
    };

    expect((await judge(root, ledger, clock, commandRunner, "fixture --proof", /same/)).kind).toBe(
      "cleared",
    );
    expect(
      (await judge(root, ledger, clock, commandRunner, "fixture --proof", /same|other/)).kind,
    ).toBe("cleared");
    expect(ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(2);
  });
});
