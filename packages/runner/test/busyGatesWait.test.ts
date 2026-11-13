import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type Clock, createControlledClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { nodeKey } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function clockWithAdvancingSleep(sleeps: number[]): Clock {
  const controlled = createControlledClock({ initialTime: 0 });
  return {
    now: () => controlled.now(),
    sleep: async (duration) => {
      sleeps.push(duration);
      controlled.advanceBy(duration);
    },
    timeout: (duration) => controlled.timeout(duration),
    deadline: (target) => controlled.deadline(target),
    interval: (duration, callback) => controlled.interval(duration, callback),
  };
}

function root(): string {
  const runs = join(import.meta.dirname, ".runs");
  mkdirSync(runs, { recursive: true });
  const path = mkdtempSync(join(runs, "busy-gates-"));
  roots.push(path);
  writeFileSync(`${path}/content.txt`, "busy\n");
  gitInitFixtureWithContent(path);
  return path;
}

function gateResult(exitCode: number): {
  readonly exitCode: number;
  readonly output: string;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
} {
  return { exitCode, output: "", stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
}

describe("busy gate waits", () => {
  it("uses the bounded doubling allowance and records every refusal", async () => {
    const worktree = root();
    const ledger = memoryLedger();
    const sleeps: number[] = [];
    let starts = 0;
    const judged = await judgeGates({
      ledger,
      clock: clockWithAdvancingSleep(sleeps),
      node: { graph: "busy", id: "n" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: "echo pass" }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      busy: { exitCode: 75, attempts: 3, firstBackoffMs: 10, maxBackoffMs: 15 },
      commandRunner: async (_argv, _cwd, env) => {
        starts += 1;
        expect(env["INTERLOCK_BUSY_REPORT"]).toBeDefined();
        expect(env["INTERLOCK_GATE_START"]).toBeDefined();
        expect(existsSync(env["INTERLOCK_GATE_START"] ?? "")).toBe(false);
        writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "lock unavailable\n");
        return gateResult(75);
      },
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(starts).toBe(3);
    expect(sleeps).toEqual([10, 15]);
    expect(judged.value).toMatchObject({
      kind: "held",
      because: "machine busy after 3 attempts: lock unavailable",
      on: { kind: "gate-failure", failure: "gate", disposition: "retry" },
    });
    const receipts = ledger.projection().nodes.get(nodeKey({ graph: "busy", id: "n" }))?.receipts;
    expect(receipts).toHaveLength(3);
    expect(receipts?.map((receipt) => receipt.proof)).toEqual([
      { refused: "busy", reason: "lock unavailable", attempt: 1, judgement: expect.any(String) },
      { refused: "busy", reason: "lock unavailable", attempt: 2, judgement: expect.any(String) },
      { refused: "busy", reason: "lock unavailable", attempt: 3, judgement: expect.any(String) },
    ]);
    expect(new Set(receipts?.map((receipt) => receipt.proof["judgement"])).size).toBe(1);
  });

  it("keeps busy receipts when the prefix admits on a later start", async () => {
    const worktree = root();
    const ledger = memoryLedger();
    let starts = 0;
    const judged = await judgeGates({
      ledger,
      clock: clockWithAdvancingSleep([]),
      node: { graph: "busy", id: "n" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: "echo pass" }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 10, maxBackoffMs: 100 },
      commandRunner: async (_argv, _cwd, env) => {
        starts += 1;
        if (starts < 3) {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", `busy ${starts}\n`);
          return gateResult(75);
        }
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return gateResult(0);
      },
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(starts).toBe(3);
    expect(judged.value.kind).toBe("cleared");
    expect(
      ledger.projection().nodes.get(nodeKey({ graph: "busy", id: "n" }))?.receipts,
    ).toHaveLength(3);
  });

  it("retries a declined node-engine probe from the same allowance", async () => {
    const worktree = root();
    writeFileSync(`${worktree}/package.json`, JSON.stringify({ engines: { node: ">=0" } }));
    const ledger = memoryLedger();
    const sleeps: number[] = [];
    let probeStarts = 0;
    let gateStarts = 0;
    const judged = await judgeGates({
      ledger,
      clock: clockWithAdvancingSleep(sleeps),
      node: { graph: "busy", id: "n" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: "echo pass" }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt", "package.json"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 10, maxBackoffMs: 100 },
      nodeVersionRunner: async (_argv, _cwd, env) => {
        probeStarts += 1;
        if (probeStarts < 3) {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", `probe ${probeStarts}\n`);
          return ok({ code: 75, signal: null, stdout: "", stderr: "" });
        }
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return ok({ code: 0, signal: null, stdout: "v26.13.0\n", stderr: "" });
      },
      commandRunner: async () => {
        gateStarts += 1;
        return gateResult(0);
      },
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(judged.value.kind).toBe("cleared");
    expect(probeStarts).toBe(3);
    expect(gateStarts).toBe(1);
    expect(sleeps).toEqual([10, 20]);
    expect(
      ledger
        .projection()
        .nodes.get(nodeKey({ graph: "busy", id: "n" }))
        ?.receipts.map((receipt) => receipt.gate),
    ).toEqual(["node-engine", "node-engine", "gate"]);
  });
});
