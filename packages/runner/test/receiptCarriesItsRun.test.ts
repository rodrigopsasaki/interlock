import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { memoryLedgerWithLog } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const miseState = mkdtempSync(join(runsRoot, "receipt-run-mise-"));
process.env["MISE_STATE_DIR"] = miseState;

const node = { graph: "fixture", id: "n1" };
const pass = `${process.execPath} -e process.exit(0)`;
const fail = `${process.execPath} -e process.exit(1)`;
const stdout = `${process.execPath} -e process.stdout.write("same")`;
const stderr = `${process.execPath} -e process.stderr.write("same")`;
const matching = `${process.execPath} -e process.stdout.write("match")`;
const nonMatching = `${process.execPath} -e process.stdout.write("miss")`;

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

afterAll(() => {
  rmSync(miseState, { recursive: true, force: true });
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "receipt-run-"));
  writeFileSync(join(directory, "content.txt"), "content\n");
  gitInitFixtureWithContent(directory);
  return directory;
}

async function judge(
  root: string,
  ledger: ReturnType<typeof memoryLedgerWithLog>["ledger"],
  run: string,
  expectOutput?: RegExp,
) {
  const judged = await judgeGates({
    ledger,
    clock: createControlledClock(),
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
    narrate: () => {},
  });
  if (isErr(judged)) throw new Error("expected an outcome");
  return judged.value;
}

describe("command receipt identity", () => {
  it("keeps a pass and a fail on distinct receipts and points at the pass", async () => {
    const root = fixture();
    const { ledger, events } = memoryLedgerWithLog();

    expect((await judge(root, ledger, fail)).kind).toBe("held");
    expect((await judge(root, ledger, pass)).kind).toBe("cleared");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("proof")?.kind).toBe("satisfied");
    if (view?.gates.get("proof")?.kind === "satisfied") {
      expect(view.gates.get("proof")?.receipt.proof["exitCode"]).toBe(0);
    }
    expect(view?.receipts).toHaveLength(2);
    expect(events.filter((event) => event.kind === "receipt-written")).toHaveLength(2);
  });

  it("points at the failing receipt after a pass and then a fail", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();

    expect((await judge(root, ledger, pass)).kind).toBe("cleared");
    expect((await judge(root, ledger, fail)).kind).toBe("held");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("proof")?.kind).toBe("blocked");
    expect(view?.receipts).toHaveLength(2);
  });

  it("reuses identical proof while ignoring duration", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();

    await judge(root, ledger, pass);
    await judge(root, ledger, pass);

    expect(ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(1);
  });

  it("includes output matching and stream references in command identity", async () => {
    const root = fixture();
    const { ledger } = memoryLedgerWithLog();

    expect((await judge(root, ledger, nonMatching, /match/)).kind).toBe("held");
    expect((await judge(root, ledger, matching, /match/)).kind).toBe("cleared");
    expect(ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(2);

    const split = memoryLedgerWithLog();
    await judge(root, split.ledger, stdout);
    await judge(root, split.ledger, stderr);
    expect(split.ledger.projection().nodes.get(nodeKey(node))?.receipts).toHaveLength(2);
  });
});
