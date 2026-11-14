import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type Clock, createControlledClock } from "@phyxiusjs/clock";
import { isErr, ok, unwrap } from "@phyxiusjs/fp";
import { assessReceipt, createLedger, type Ledger, nodeKey, readReplay } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { BUSY_START_SCRIPT } from "../src/busy.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { judgeWorktree } from "../src/judgeWorktree.ts";
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
  it("keeps the ordinary argv unchanged and places the boundary after heavy", async () => {
    const worktree = root();
    const ordinaryArgv: string[][] = [];
    const ordinary = await judgeGates({
      ledger: memoryLedger(),
      clock: clockWithAdvancingSleep([]),
      node: { graph: "argv", id: "ordinary" },
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
      heavy: ["heavy"],
      commandRunner: async (argv) => {
        ordinaryArgv.push([...argv]);
        return gateResult(0);
      },
      narrate: () => {},
    });
    if (isErr(ordinary)) throw new Error(JSON.stringify(ordinary.error));
    expect(ordinaryArgv).toEqual([["heavy", "mise", "exec", "--", "echo", "pass"]]);

    const boundaryArgv: string[][] = [];
    const busy = await judgeGates({
      ledger: memoryLedger(),
      clock: clockWithAdvancingSleep([]),
      node: { graph: "argv", id: "busy" },
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
      heavy: ["heavy"],
      busy: { exitCode: 75, attempts: 1, firstBackoffMs: 1, maxBackoffMs: 1 },
      commandRunner: async (argv, _cwd, env) => {
        boundaryArgv.push([...argv]);
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return gateResult(0);
      },
      narrate: () => {},
    });
    if (isErr(busy)) throw new Error(JSON.stringify(busy.error));
    expect(boundaryArgv).toHaveLength(1);
    expect(boundaryArgv[0]).toEqual([
      "heavy",
      "/bin/sh",
      "-c",
      expect.any(String),
      "interlock-gate-start",
      "mise",
      "exec",
      "--",
      "echo",
      "pass",
    ]);
  });

  it("keeps the node-engine probe argv byte-identical without busy and exact with busy", async () => {
    const worktree = root();
    writeFileSync(join(worktree, "package.json"), JSON.stringify({ engines: { node: ">=0" } }));
    const bin = join(worktree, "bin");
    mkdirSync(bin);
    writeFileSync(join(bin, "node"), "", { mode: 0o755 });
    const nodePath = join(bin, "node");
    const ordinaryArgv: string[][] = [];
    const ordinary = await judgeGates({
      ledger: memoryLedger(),
      clock: clockWithAdvancingSleep([]),
      node: { graph: "node-argv", id: "ordinary" },
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
      env: { ...process.env, PATH: bin },
      heavy: ["heavy"],
      nodeVersionRunner: async (argv) => {
        ordinaryArgv.push([...argv]);
        return ok({ code: 0, signal: null, stdout: "v26.13.0\n", stderr: "" });
      },
      commandRunner: async () => gateResult(0),
      narrate: () => {},
    });
    if (isErr(ordinary)) throw new Error(JSON.stringify(ordinary.error));
    expect(ordinaryArgv).toEqual([["heavy", "mise", "exec", "--", nodePath, "--version"]]);

    const busyArgv: string[][] = [];
    const busy = await judgeGates({
      ledger: memoryLedger(),
      clock: clockWithAdvancingSleep([]),
      node: { graph: "node-argv", id: "busy" },
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
      env: { ...process.env, PATH: bin },
      heavy: ["heavy"],
      busy: { exitCode: 75, attempts: 1, firstBackoffMs: 1, maxBackoffMs: 1 },
      nodeVersionRunner: async (argv, _cwd, env) => {
        busyArgv.push([...argv]);
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return ok({ code: 0, signal: null, stdout: "v26.13.0\n", stderr: "" });
      },
      commandRunner: async () => gateResult(0),
      narrate: () => {},
    });
    if (isErr(busy)) throw new Error(JSON.stringify(busy.error));
    expect(busyArgv).toEqual([
      [
        "heavy",
        "/bin/sh",
        "-c",
        BUSY_START_SCRIPT,
        "interlock-gate-start",
        "mise",
        "exec",
        "--",
        nodePath,
        "--version",
      ],
    ]);
  });

  it("lets a real prefix refuse before start, then hides the boundary channels from the gate", async () => {
    const worktree = root();
    const bin = join(worktree, "bin");
    mkdirSync(bin);
    const count = join(worktree, "prefix-count");
    const codexStarts = join(worktree, "codex-starts");
    const environmentDump = join(worktree, "environment.json");
    const errorDump = join(worktree, "error.txt");
    const ownReport = join(worktree, "gate-report");
    const prefix = join(worktree, "prefix.cjs");
    writeFileSync(
      prefix,
      `const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const countPath = ${JSON.stringify(count)};
const current = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
const next = current + 1;
fs.writeFileSync(countPath, String(next));
if (next <= 2) {
  fs.writeFileSync(process.env.INTERLOCK_BUSY_REPORT, 'prefix refusal ' + String(next) + '\\n');
  process.exit(75);
}
fs.writeFileSync(process.env.INTERLOCK_BUSY_REPORT, 'prefix admitted\\n');
const child = spawnSync(process.argv[2], process.argv.slice(3), { env: process.env, stdio: 'pipe' });
if (child.error) fs.writeFileSync(${JSON.stringify(errorDump)}, String(child.error));
if (child.stderr) fs.writeFileSync(${JSON.stringify(errorDump)}, String(child.stderr));
process.stdout.write(child.stdout ?? '');
process.stderr.write(child.stderr ?? '');
process.exit(child.status ?? 1);
`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "mise"),
      `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
const marker = process.argv.indexOf('--');
const child = spawnSync(process.argv[marker + 1], process.argv.slice(marker + 2), { env: process.env, stdio: 'inherit' });
process.exit(child.status ?? 1);
`,
      { mode: 0o755 },
    );
    const command = join(worktree, "fake-codex.cjs");
    writeFileSync(
      command,
      `const fs = require('node:fs');
const countPath = ${JSON.stringify(codexStarts)};
const current = fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0;
fs.writeFileSync(countPath, String(current + 1));
fs.writeFileSync(${JSON.stringify(environmentDump)}, JSON.stringify({ report: process.env.INTERLOCK_BUSY_REPORT, start: process.env.INTERLOCK_GATE_START }));
if (process.env.FAKE_GATE_FAIL === '1') {
  fs.writeFileSync(${JSON.stringify(ownReport)}, 'gate wrote this\\n');
  process.exit(75);
}
`,
    );
    const ledger = memoryLedger();
    const judged = await judgeGates({
      ledger,
      clock: clockWithAdvancingSleep([]),
      node: { graph: "boundary", id: "real" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: `${process.execPath} ${command}` }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      heavy: [process.execPath, prefix],
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 10, maxBackoffMs: 20 },
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}` },
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(judged.value.kind).toBe("cleared");
    expect(readFileSync(count, "utf8")).toBe("3");
    expect(readFileSync(codexStarts, "utf8")).toBe("1");
    expect(JSON.parse(readFileSync(environmentDump, "utf8"))).toEqual({});
    expect(readdirSync(worktree).some((path) => path.startsWith(".interlock-gate-"))).toBe(false);
    const receipts = ledger
      .projection()
      .nodes.get(nodeKey({ graph: "boundary", id: "real" }))?.receipts;
    expect(receipts?.slice(0, 2).map((receipt) => receipt.proof["reason"])).toEqual([
      "prefix refusal 1",
      "prefix refusal 2",
    ]);

    const ownLedger = memoryLedger();
    const ownResult = await judgeGates({
      ledger: ownLedger,
      clock: clockWithAdvancingSleep([]),
      node: { graph: "boundary", id: "gate-failure" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: `${process.execPath} ${command}` }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      heavy: [process.execPath, prefix],
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 10, maxBackoffMs: 20 },
      env: { ...process.env, PATH: `${bin}:${process.env["PATH"] ?? ""}`, FAKE_GATE_FAIL: "1" },
      narrate: () => {},
    });
    if (isErr(ownResult)) throw new Error(JSON.stringify(ownResult.error));
    expect(ownResult.value.kind).toBe("held");
    expect(readFileSync(codexStarts, "utf8")).toBe("2");
    expect(
      ownLedger.projection().nodes.get(nodeKey({ graph: "boundary", id: "gate-failure" }))
        ?.receipts[0]?.proof,
    ).toEqual(expect.objectContaining({ exitCode: 75 }));
    expect(
      ownLedger.projection().nodes.get(nodeKey({ graph: "boundary", id: "gate-failure" }))
        ?.receipts[0]?.proof["refused"],
    ).toBeUndefined();
  });

  it("does not classify a gate's own busy report or an incomplete refusal as machine busy", async () => {
    const worktree = root();
    const ownReport = join(worktree, "gate-report");
    let ownStarts = 0;
    const ownLedger = memoryLedger();
    const ownResult = await judgeGates({
      ledger: ownLedger,
      clock: clockWithAdvancingSleep([]),
      node: { graph: "ordinary", id: "own" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: "gate" }]]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 1, maxBackoffMs: 1 },
      commandRunner: async () => {
        ownStarts += 1;
        writeFileSync(ownReport, "gate wrote this\n");
        return gateResult(75);
      },
      narrate: () => {},
    });
    if (isErr(ownResult)) throw new Error(JSON.stringify(ownResult.error));
    expect(ownStarts).toBe(1);
    expect(ownResult.value.kind).toBe("held");
    expect(
      ownLedger.projection().nodes.get(nodeKey({ graph: "ordinary", id: "own" }))?.receipts[0]
        ?.proof,
    ).toEqual(expect.objectContaining({ exitCode: 75 }));

    for (const [name, result] of [
      ["no-reason", gateResult(75)],
      ["wrong-code", gateResult(76)],
    ] as const) {
      let starts = 0;
      const ledger = memoryLedger();
      const judged = await judgeGates({
        ledger,
        clock: clockWithAdvancingSleep([]),
        node: { graph: "ordinary", id: name },
        session: "session",
        declaredGateIds: ["gate"],
        commandFor: new Map([["gate", { kind: "command", run: "gate" }]]),
        worktree,
        scopeRoot: worktree,
        scopePaths: ["content.txt"],
        commitSha: "commit",
        runnerId: "runner",
        holdMs: 60_000,
        substrate: noneClient(),
        busy: { exitCode: 75, attempts: 4, firstBackoffMs: 1, maxBackoffMs: 1 },
        commandRunner: async (_argv, _cwd, env) => {
          starts += 1;
          if (name === "wrong-code") writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "reason\n");
          return result;
        },
        narrate: () => {},
      });
      if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
      expect(starts).toBe(1);
      expect(judged.value.kind).toBe("held");
      expect(
        ledger.projection().nodes.get(nodeKey({ graph: "ordinary", id: name }))?.receipts,
      ).toHaveLength(1);
      expect(
        ledger.projection().nodes.get(nodeKey({ graph: "ordinary", id: name }))?.receipts[0]?.proof,
      ).toEqual(expect.objectContaining({ exitCode: result.exitCode }));
    }
  });

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

  it("shares one refusal allowance between the node probe and two gates", async () => {
    const worktree = root();
    writeFileSync(join(worktree, "package.json"), JSON.stringify({ engines: { node: ">=0" } }));
    const ledger = memoryLedger();
    const sleeps: number[] = [];
    let probeStarts = 0;
    let gateStarts = 0;
    const judged = await judgeGates({
      ledger,
      clock: clockWithAdvancingSleep(sleeps),
      node: { graph: "shared", id: "n" },
      session: "session",
      declaredGateIds: ["one", "two"],
      commandFor: new Map([
        ["one", { kind: "command", run: "echo one" }],
        ["two", { kind: "command", run: "echo two" }],
      ]),
      worktree,
      scopeRoot: worktree,
      scopePaths: ["content.txt", "package.json"],
      commitSha: "commit",
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      busy: { exitCode: 75, attempts: 4, firstBackoffMs: 10, maxBackoffMs: 40 },
      nodeVersionRunner: async (_argv, _cwd, env) => {
        probeStarts += 1;
        if (probeStarts === 1) {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "probe busy\n");
          return ok({ code: 75, signal: null, stdout: "", stderr: "" });
        }
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return ok({ code: 0, signal: null, stdout: "v26.13.0\n", stderr: "" });
      },
      commandRunner: async (_argv, _cwd, env) => {
        gateStarts += 1;
        if (gateStarts === 1 || gateStarts === 3) {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", `gate ${gateStarts} busy\n`);
          return gateResult(75);
        }
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return gateResult(0);
      },
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(judged.value.kind).toBe("cleared");
    expect(probeStarts).toBe(2);
    expect(gateStarts).toBe(4);
    expect(sleeps).toEqual([10, 20, 40]);
    const receipts = ledger.projection().nodes.get(nodeKey({ graph: "shared", id: "n" }))?.receipts;
    expect(receipts?.filter((receipt) => receipt.proof["refused"] === "busy")).toHaveLength(3);
    expect(
      receipts
        ?.filter((receipt) => receipt.proof["refused"] === "busy")
        .map((receipt) => receipt.proof["attempt"]),
    ).toEqual([1, 2, 3]);
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

  it("carries the busy policy through judgeWorktree", async () => {
    const worktree = root();
    const ledger = memoryLedger();
    let starts = 0;
    const judged = await judgeWorktree({
      machine: {
        provider: {
          admit: ["admit"],
          release: ["release"],
          env: ["env"],
          heavy: ["heavy"],
          busy: { exitCode: 75, attempts: 2, firstBackoffMs: 10, maxBackoffMs: 10 },
        },
        env: {},
        heavy: ["heavy"],
      },
      ledger,
      clock: clockWithAdvancingSleep([]),
      node: { graph: "door", id: "worktree" },
      session: "session",
      declaredGateIds: ["gate"],
      commandFor: new Map([["gate", { kind: "command", run: "echo pass" }]]),
      worktree,
      narrate: () => {},
      runnerId: "runner",
      holdMs: 60_000,
      substrate: noneClient(),
      commandRunner: async (_argv, _cwd, env) => {
        starts += 1;
        if (starts === 1) {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "prefix busy\n");
          return gateResult(75);
        }
        writeFileSync(env["INTERLOCK_GATE_START"] ?? "", "started\n");
        return gateResult(0);
      },
    });
    if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
    expect(starts).toBe(2);
    expect(judged.value.kind).toBe("cleared");
  });

  it("keeps busy receipt identity across judgements and replay, and assesses it as no run", async () => {
    const worktree = root();
    const journal = join(worktree, "journal");
    const node = { graph: "identity", id: "n" };
    const request = async (ledger: Ledger) => {
      const judged = await judgeGates({
        ledger,
        clock: clockWithAdvancingSleep([]),
        node,
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
        busy: { exitCode: 75, attempts: 1, firstBackoffMs: 1, maxBackoffMs: 1 },
        commandRunner: async (_argv, _cwd, env) => {
          writeFileSync(env["INTERLOCK_BUSY_REPORT"] ?? "", "same reason\n");
          return gateResult(75);
        },
        narrate: () => {},
      });
      if (isErr(judged)) throw new Error(JSON.stringify(judged.error));
      expect(judged.value.kind).toBe("held");
    };

    const first = unwrap(
      await createLedger({ clock: clockWithAdvancingSleep([]), directory: journal }),
    );
    await request(first);
    await first.close();
    const second = unwrap(
      await createLedger({ clock: clockWithAdvancingSleep([]), directory: journal }),
    );
    await request(second);
    await second.close();

    const replayed = unwrap(await readReplay(journal));
    const receipts = replayed.nodes.get(nodeKey(node))?.receipts ?? [];
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.id).not.toBe(receipts[1]?.id);
    expect(receipts.map((receipt) => receipt.proof)).toEqual([
      { refused: "busy", reason: "same reason", attempt: 1, judgement: expect.any(String) },
      { refused: "busy", reason: "same reason", attempt: 1, judgement: expect.any(String) },
    ]);
    expect(receipts[0]?.proof["judgement"]).not.toBe(receipts[1]?.proof["judgement"]);
    expect(receipts.every((receipt) => assessReceipt(receipt).kind === "not-recorded")).toBe(true);
  });
});
