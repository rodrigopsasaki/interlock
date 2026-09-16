import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { type Brief, type LedgerEvent, nodeKey, type Receipt } from "ledger";
import type { AbsorbOutcome, EvidenceForAbsorb, SubstrateClient } from "substrate";
import { noneClient } from "substrate";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";
import type { GateCommand } from "../src/gateCommand.ts";
import { judgeGates, legacyOutputForChunk } from "../src/gateJudge.ts";
import { readGateOutput, storeGateOutput } from "../src/gateOutput.ts";
import { commitAll, gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";
import { memoryLedger, memoryLedgerWithLog } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
const miseState = mkdtempSync(join(runsRoot, "mise-"));
process.env["MISE_STATE_DIR"] = miseState;

const substrate = noneClient();

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

afterAll(() => {
  rmSync(miseState, { recursive: true, force: true });
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "gate-"));
  writeFileSync(join(directory, "content.txt"), "hello\n");
  gitInitFixtureWithContent(directory);
  return directory;
}

const node = { graph: "fixture", id: "n1" };

// Node itself, by its own already-running absolute path, rather than "true"/"false": these
// spawn through the runner's own `mise exec --` prefix, and a bare command name adds a second
// PATH lookup on top of that. process.execPath needs no lookup at all.
const passCommand = `${process.execPath} -e process.exit(0)`;
const failCommand = `${process.execPath} -e process.exit(1)`;

// \x20 stands in for a literal space: the command line is split on whitespace with no shell
// to keep a quoted argument together, so the -e script itself must contain none.
const matchingOutputCommand = `${process.execPath} -e process.stdout.write("Tests\\x203\\x20passed\\x0a")`;
const nonMatchingOutputCommand = `${process.execPath} -e process.stdout.write("Tests\\x200\\x20passed\\x0a")`;
const testsPassedPattern = /Tests +[1-9][0-9]* passed/;

interface GateOutputCase {
  readonly gate: string;
  readonly run: string;
  readonly expectOutput?: RegExp;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly outcome: "cleared" | "held";
}

describe("receipt-idempotent", () => {
  it("running the same gate twice over the same content writes one receipt identity and no duplicate fact", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const options = {
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
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
      session: "s1",
      declaredGateIds: ["always-fail"],
      commandFor: new Map([["always-fail", { kind: "command", run: failCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
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
      session: "s1",
      declaredGateIds: ["reviewed"],
      commandFor: new Map(),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
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
      session: "s1",
      declaredGateIds: ["foreign-none", "kept-local"],
      commandFor: new Map([["foreign-none", { kind: "command", run: failCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("foreign-none")?.kind).toBe("blocked");
    expect(view?.gates.get("kept-local")?.kind).toBe("satisfied");
    expect(view?.receipts.find((receipt) => receipt.gate === "kept-local")?.id).toBe("kept");
  });
});

describe("human gates", () => {
  it("holds a node on a pending human gate, naming it and that a person's verb clears it, never spawning a command", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["witnessed"],
      commandFor: new Map([["witnessed", { kind: "human", run: failCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: (line) => narrated.push(line),
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    if (judged.value.kind !== "held") return;
    expect(judged.value.on).toEqual({
      kind: "gate-failure",
      failure: "witnessed",
      disposition: "hold",
    });
    expect(judged.value.because).toBe("witnessed: awaits a person; a person's verb clears it.");
    expect(narrated).toContain("witnessed: awaits a person");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("witnessed")).toBeUndefined();
    expect(view?.receipts.find((receipt) => receipt.gate === "witnessed")).toBeUndefined();
  });

  it("clears the node once a person has satisfied the human gate, without ever running its command", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const clearedReceipt: Receipt = {
      id: "cleared-r1",
      gate: "witnessed",
      commitSha: "deadbeef",
      spend: { kind: "none" },
      duration: { kind: "unknown" },
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
      proof: { because: "watched the brief render and the debrief absorb" },
    };
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "witnessed",
      to: { kind: "satisfied", receipt: clearedReceipt },
    });

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["witnessed"],
      commandFor: new Map([["witnessed", { kind: "human", run: failCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    if (judged.value.kind !== "cleared") return;
    expect(judged.value.receipts).toHaveLength(1);
    expect(judged.value.receipts[0]?.id).toBe("cleared-r1");

    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("witnessed")?.kind).toBe("satisfied");
    expect(view?.receipts.find((receipt) => receipt.gate === "witnessed")).toBeUndefined();
  });
});

describe("gate command placeholders", () => {
  it("substitutes {graph} and {node} before spawning", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const commandNode = { graph: "fixture", id: "n1" };

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node: commandNode,
      session: "s1",
      declaredGateIds: ["echoes"],
      commandFor: new Map([["echoes", { kind: "command", run: "test {node} = n1" }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
  });

  it("refuses a gate command with an unknown placeholder", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["broken"],
      commandFor: new Map([["broken", { kind: "command", run: "pnpm run {branch}" }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    expect(isErr(judged)).toBe(true);
    if (!isErr(judged)) return;
    expect(judged.error).toEqual({
      kind: "placeholder",
      gateId: "broken",
      refusal: {
        kind: "unknown-placeholder",
        token: "branch",
        command: "pnpm run {branch}",
      },
    });
  });
});

describe("expect_output", () => {
  it("clears when the command exits zero and its output matches the declared pattern", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["tested"],
      commandFor: new Map([
        [
          "tested",
          {
            kind: "command",
            run: matchingOutputCommand,
            expectOutput: testsPassedPattern,
          },
        ],
      ]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const view = ledger.projection().nodes.get(nodeKey(node));
    expect(view?.gates.get("tested")?.kind).toBe("satisfied");
    const receipt = view?.receipts.find((candidate) => candidate.gate === "tested");
    expect(receipt?.proof).toMatchObject({
      exitCode: 0,
      outputHash: expect.any(String),
      outputMatched: true,
      pattern: "Tests +[1-9][0-9]* passed",
    });
  });

  it("holds when the command exits zero but its output does not match the declared pattern", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["tested"],
      commandFor: new Map([
        [
          "tested",
          {
            kind: "command",
            run: nonMatchingOutputCommand,
            expectOutput: testsPassedPattern,
          },
        ],
      ]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    const view = ledger.projection().nodes.get(nodeKey(node));
    const gateState = view?.gates.get("tested");
    expect(gateState?.kind).toBe("blocked");
    if (gateState?.kind !== "blocked") return;
    expect(gateState.because).toBe("tested: output did not match /Tests +[1-9][0-9]* passed/");
    const receipt = view?.receipts.find((candidate) => candidate.gate === "tested");
    expect(receipt?.proof).toMatchObject({
      exitCode: 0,
      outputHash: expect.any(String),
      outputMatched: false,
      pattern: "Tests +[1-9][0-9]* passed",
    });
  });

  it("fails on a nonzero exit even with a declared pattern, naming the exit code, not the pattern", async () => {
    const root = fixture();
    const ledger = memoryLedger();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["tested"],
      commandFor: new Map([
        [
          "tested",
          {
            kind: "command",
            run: failCommand,
            expectOutput: testsPassedPattern,
          },
        ],
      ]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    const view = ledger.projection().nodes.get(nodeKey(node));
    const gateState = view?.gates.get("tested");
    expect(gateState?.kind).toBe("blocked");
    if (gateState?.kind !== "blocked") return;
    expect(gateState.because).toBe("tested: exit 1");
  });
});

describe("retained gate output", () => {
  it("retains literal stdout and stderr bytes for successful, failed, mismatched, and empty commands", async () => {
    const cases: readonly GateOutputCase[] = [
      {
        gate: "success",
        run: `${process.execPath} -e process.stdout.write(Buffer.from([0,97,255]));process.stderr.write(Buffer.from([226,130,172]))`,
        stdout: Buffer.from([0, 97, 255]),
        stderr: Buffer.from([226, 130, 172]),
        outcome: "cleared",
      },
      {
        gate: "failed",
        run: `${process.execPath} -e process.stdout.write(Buffer.from([102]));process.stderr.write(Buffer.from([101]));process.exit(7)`,
        stdout: Buffer.from("f"),
        stderr: Buffer.from("e"),
        outcome: "held",
      },
      {
        gate: "mismatched",
        run: nonMatchingOutputCommand,
        expectOutput: testsPassedPattern,
        stdout: Buffer.from("Tests 0 passed\n"),
        stderr: Buffer.alloc(0),
        outcome: "held",
      },
      {
        gate: "empty",
        run: passCommand,
        stdout: Buffer.alloc(0),
        stderr: Buffer.alloc(0),
        outcome: "cleared",
      },
    ];
    const root = fixture();

    for (const entry of cases) {
      const ledger = memoryLedger();
      const command: GateCommand =
        entry.expectOutput === undefined
          ? { kind: "command", run: entry.run }
          : { kind: "command", run: entry.run, expectOutput: entry.expectOutput };
      const judged = await judgeGates({
        ledger,
        clock: createControlledClock(),
        node,
        session: "s1",
        declaredGateIds: [entry.gate],
        commandFor: new Map([[entry.gate, command]]),
        worktree: root,
        scopeRoot: root,
        scopePaths: ["content.txt"],
        commitSha: "deadbeef",
        runnerId: "run-1",
        holdMs: 60_000,
        substrate,
        narrate: () => {},
      });

      if (isErr(judged)) throw new Error("expected retained output");
      expect(judged.value.kind).toBe(entry.outcome);
      const receipt = ledger.projection().nodes.get(nodeKey(node))?.receipts[0];
      expect(receipt).toBeDefined();
      if (receipt === undefined) return;
      const output = await readGateOutput(sharedJournalDirectory(root), receipt.proof);
      if (isErr(output)) throw new Error("expected readable retained output");
      expect(output.value).toEqual({
        kind: "available",
        stdout: entry.stdout,
        stderr: entry.stderr,
      });
    }
  });

  it("keeps raw UTF-8 bytes from a real command", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const run = `${process.execPath} -e process.stdout.write(Buffer.from([226,130,172]))`;
    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["utf8"],
      commandFor: new Map([["utf8", { kind: "command", run }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected retained output");
    const receipt = ledger.projection().nodes.get(nodeKey(node))?.receipts[0];
    expect(receipt).toBeDefined();
    if (receipt === undefined) return;
    const output = await readGateOutput(sharedJournalDirectory(root), receipt.proof);
    if (isErr(output) || output.value.kind !== "available") {
      throw new Error("expected readable retained output");
    }
    expect(output.value.stdout).toEqual(Buffer.from([226, 130, 172]));
  });

  it("preserves legacy output hashing for separately decoded chunks", () => {
    const output = [Buffer.from([226]), Buffer.from([130, 172])].map(legacyOutputForChunk).join("");

    expect(createHash("sha256").update(output).digest("hex")).toBe(
      createHash("sha256").update("\ufffd\ufffd\ufffd").digest("hex"),
    );
  });

  it("keeps output in the shared journal after its linked worktree leaves", async () => {
    const root = fixture();
    const linked = `${root}-linked`;
    execFileSync("git", ["worktree", "add", "--detach", linked, "HEAD"], { cwd: root });
    const ledger = memoryLedger();
    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["survives"],
      commandFor: new Map([["survives", { kind: "command", run: matchingOutputCommand }]]),
      worktree: linked,
      scopeRoot: linked,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    execFileSync("git", ["worktree", "remove", linked], { cwd: root });
    if (isErr(judged)) throw new Error("expected retained output");
    const receipt = ledger.projection().nodes.get(nodeKey(node))?.receipts[0];
    expect(receipt).toBeDefined();
    if (receipt === undefined) return;
    const output = await readGateOutput(sharedJournalDirectory(root), receipt.proof);
    if (isErr(output) || output.value.kind !== "available") {
      throw new Error("expected retained output after worktree removal");
    }
    expect(output.value.stdout).toEqual(Buffer.from("Tests 3 passed\n"));
  });

  it("accepts concurrent identical writes and refuses missing or corrupt stored output", async () => {
    const root = fixture();
    const journal = sharedJournalDirectory(root);
    const stdout = Buffer.from("same stdout");
    const stderr = Buffer.from("same stderr");
    const stored = await Promise.all([
      storeGateOutput(journal, stdout, stderr),
      storeGateOutput(journal, stdout, stderr),
    ]);
    expect(stored.every((result) => !isErr(result))).toBe(true);
    const first = stored[0];
    if (first === undefined || isErr(first)) return;
    expect(readFileSync(join(journal, ...first.value.stdout.artifact.split("/")))).toEqual(stdout);

    unlinkSync(join(journal, ...first.value.stderr.artifact.split("/")));
    const missing = await readGateOutput(journal, { gateOutput: first.value });
    expect(isErr(missing)).toBe(true);
    if (!isErr(missing)) return;
    expect(missing.error.kind).toBe("missing");

    writeFileSync(join(journal, ...first.value.stdout.artifact.split("/")), "changed");
    const corrupt = await readGateOutput(journal, { gateOutput: first.value });
    expect(isErr(corrupt)).toBe(true);
    if (!isErr(corrupt)) return;
    expect(corrupt.error.kind).toBe("corrupt");
  });

  it("leaves old receipts honestly without output and refuses before writing a receipt when storage fails", async () => {
    const root = fixture();
    const absent = await readGateOutput(sharedJournalDirectory(root), { outputHash: "legacy" });
    if (isErr(absent)) throw new Error("expected legacy output to be absent, not corrupt");
    expect(absent.value).toEqual({ kind: "absent" });

    writeFileSync(join(root, ".interlock"), "not a directory");
    const ledger = memoryLedger();
    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["unwritable"],
      commandFor: new Map([["unwritable", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });
    expect(isErr(judged)).toBe(true);
    if (!isErr(judged)) return;
    expect(judged.error.kind).toBe("output");
    expect(ledger.projection().nodes.get(nodeKey(node))).toBeUndefined();
  });
});

const SHA = "a".repeat(40);

function writeSession(
  root: string,
  graph: string,
  nodeId: string,
  debriefYaml: string,
  notesYaml: string,
): void {
  const dir = join(root, ".interlock", "sessions", graph, nodeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "debrief.yaml"), debriefYaml);
  writeFileSync(join(dir, "notes.yaml"), notesYaml);
}

const v2Debrief = [
  "interlock: debrief@v2",
  "graph: fixture",
  "node: n1",
  "role: worker",
  `graph_base_sha: ${SHA}`,
  `session_start_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions:",
  "  - id: c1",
  "    what: did a thing",
  "    because: notes:1",
  "    rests_on: []",
  "    hunks: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

const v0Debrief = [
  "interlock: debrief@v0",
  "graph: fixture",
  "node: n1",
  `base_sha: ${SHA}`,
  `head_sha: ${SHA}`,
  "derivation:",
  "  kind: agent",
  "  runtime: claude-code",
  "  model: claude-sonnet-5",
  "discoveries: []",
  "decisions: []",
  "gates_run_by_agent: []",
  "open: []",
  "",
].join("\n");

const notesYaml = [
  "interlock: notes@v0",
  "node: n1",
  "entries:",
  "  - kind: choice",
  '    at: "2026-09-10T00:00:00Z"',
  "    chose: did the thing",
  "    because: it was needed",
  "",
].join("\n");

const correctedV2Debrief = v2Debrief.replace("did a thing", "did the corrected thing");
const reformattedCorrectedV2Debrief = stringify(
  parse(correctedV2Debrief.replace("graph: fixture\nnode: n1", "node: n1\ngraph: fixture")),
);

function isDebriefFiledForSession(
  event: LedgerEvent,
  session: string,
): event is Extract<LedgerEvent, { readonly kind: "debrief-filed" }> {
  return event.kind === "debrief-filed" && event.session === session;
}

describe("debrief ingestion", () => {
  it("appends debrief-filed and every note-appended before the outcome, for a cleared v2 node", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const { ledger, events } = memoryLedgerWithLog();
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief: {
        graph: node.graph,
        node: node.id,
        role: "worker",
        acceptance: "fixture",
        gates: ["always-pass"],
        scope: [],
      },
    });

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const kinds = events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "debrief-filed")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "note-appended")).toHaveLength(1);
    expect(kinds.indexOf("debrief-filed")).toBeLessThan(kinds.indexOf("outcome-set"));
    expect(kinds.indexOf("note-appended")).toBeLessThan(kinds.indexOf("outcome-set"));

    const sessionView = ledger.projection().sessions.get("s1");
    expect(sessionView?.debrief?.graph).toBe("fixture");
    expect(sessionView?.notes).toHaveLength(1);
  });

  it("appends nothing beyond the outcome for a legacy-valid debrief", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v0Debrief, notesYaml);
    const { ledger, events } = memoryLedgerWithLog();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const kinds = events.map((event) => event.kind);
    expect(kinds).not.toContain("debrief-filed");
    expect(kinds).not.toContain("note-appended");
  });

  it("does not duplicate an unchanged v2 debrief when the same session is judged again", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const { ledger, events } = memoryLedgerWithLog();
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief: {
        graph: node.graph,
        node: node.id,
        role: "worker",
        acceptance: "fixture",
        gates: ["always-pass"],
        scope: [],
      },
    });

    const options = {
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    };

    const first = await judgeGates(options);
    if (isErr(first)) throw new Error("expected an outcome");
    const second = await judgeGates(options);
    if (isErr(second)) throw new Error("expected an outcome");

    const kinds = events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "debrief-filed")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "note-appended")).toHaveLength(1);
  });

  it("files a selected correction once, keeps the original filing and notes, and isolates another session", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const { ledger, events } = memoryLedgerWithLog();
    const brief: Brief = {
      graph: node.graph,
      node: node.id,
      role: "worker",
      acceptance: "fixture",
      gates: ["always-pass"],
      scope: [],
    };
    ledger.append({ kind: "session-started", session: { id: "s1", node }, brief });
    ledger.append({ kind: "session-started", session: { id: "s2", node }, brief });

    const options = {
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate,
      narrate: () => {},
    };

    const first = await judgeGates(options);
    if (isErr(first)) throw new Error("expected an outcome");
    const isolated = await judgeGates({ ...options, session: "s2" });
    if (isErr(isolated)) throw new Error("expected an outcome");

    writeSession(root, "fixture", "n1", correctedV2Debrief, notesYaml);
    const corrected = await judgeGates(options);
    if (isErr(corrected)) throw new Error("expected an outcome");

    expect(reformattedCorrectedV2Debrief).not.toBe(correctedV2Debrief);
    writeSession(root, "fixture", "n1", reformattedCorrectedV2Debrief, notesYaml);
    const unchanged = await judgeGates(options);
    if (isErr(unchanged)) throw new Error("expected an outcome");

    writeSession(root, "fixture", "n1", v0Debrief, notesYaml);
    const legacy = await judgeGates(options);
    if (isErr(legacy)) throw new Error("expected an outcome");
    writeSession(root, "fixture", "n1", "not: [valid", notesYaml);
    const malformed = await judgeGates(options);
    if (isErr(malformed)) throw new Error("expected an outcome");
    unlinkSync(join(root, ".interlock", "sessions", "fixture", "n1", "debrief.yaml"));
    const missing = await judgeGates(options);
    if (isErr(missing)) throw new Error("expected an outcome");

    const firstFilings = events.filter((event) => isDebriefFiledForSession(event, "s1"));
    const firstNotes = events.filter(
      (event) => event.kind === "note-appended" && event.session === "s1",
    );
    const secondFilings = events.filter((event) => isDebriefFiledForSession(event, "s2"));
    const secondNotes = events.filter(
      (event) => event.kind === "note-appended" && event.session === "s2",
    );

    expect(firstFilings).toHaveLength(2);
    expect(firstNotes).toHaveLength(1);
    expect(secondFilings).toHaveLength(1);
    expect(secondNotes).toHaveLength(1);
    expect(firstFilings[0]?.debrief.decisions[0]?.what).toBe("did a thing");
    expect(firstFilings[1]?.debrief.decisions[0]?.what).toBe("did the corrected thing");
    expect(ledger.projection().sessions.get("s1")?.debrief?.decisions[0]?.what).toBe(
      "did the corrected thing",
    );
    expect(ledger.projection().sessions.get("s2")?.debrief?.decisions[0]?.what).toBe("did a thing");
  });
});

const EVIDENCE_AGENTS_MD = [
  "## Vocabulary",
  "",
  "| term | means |",
  "| --- | --- |",
  "| widget | A thing. |",
  "",
  "## Next",
  "",
].join("\n");

function spySubstrate(): {
  readonly client: SubstrateClient;
  readonly absorbCalls: EvidenceForAbsorb[];
} {
  const absorbCalls: EvidenceForAbsorb[] = [];
  const client: SubstrateClient = {
    address: "spy",
    context: () => Promise.resolve({ kind: "empty" }),
    absorb: (_node, _debrief, _notes, _receipts, evidence): Promise<AbsorbOutcome> => {
      absorbCalls.push(evidence ?? { items: [], gaps: [] });
      return Promise.resolve({ kind: "empty" });
    },
    prepareAbsorb: (_node, _debrief, _notes, _receipts, evidence) => {
      absorbCalls.push(evidence ?? { items: [], gaps: [] });
      return Promise.resolve({ kind: "none" });
    },
    capabilities: () => Promise.resolve([]),
  };
  return { client, absorbCalls };
}

describe("absorb carries live evidence", () => {
  it("passes items and gaps built from a real verifyDebrief pass to substrate.absorb", async () => {
    const root = mkdtempSync(join(runsRoot, "gate-evidence-"));
    writeFileSync(join(root, "AGENTS.md"), EVIDENCE_AGENTS_MD);
    gitInitFixtureWithContent(root);
    const from = headSha(root);

    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(
      join(root, "src/widget.ts"),
      ["export interface Widget {", "  readonly id: string;", "}", ""].join("\n"),
    );
    commitAll(root, "add widget");
    const to = headSha(root);

    const evidenceDebrief = [
      "interlock: debrief@v2",
      "graph: fixture",
      "node: n1",
      "role: worker",
      `graph_base_sha: ${from}`,
      `session_start_sha: ${from}`,
      `head_sha: ${to}`,
      "derivation:",
      "  kind: agent",
      "  runtime: claude-code",
      "  model: claude-sonnet-5",
      "discoveries:",
      "  - id: d1",
      "    what: no test yet covered a nonexistent fourth source line",
      '    found_at: src/widget.ts:4 "export interface Widget {"',
      "    mattered_because: the acceptance asked for a filtered discovery",
      "  - id: d2",
      "    what: no test yet covered Widget's own shape",
      '    found_at: src/widget.ts:1 "export interface Widget {"',
      "    mattered_because: the acceptance asked for it",
      "decisions:",
      "  - id: c1",
      "    what: added Widget",
      "    because: notes:1",
      "    rests_on: []",
      '    hunks: ["src/widget.ts:1-3"]',
      "gates_run_by_agent: []",
      "open: []",
      "",
    ].join("\n");
    writeSession(root, "fixture", "n1", evidenceDebrief, notesYaml);

    const { client, absorbCalls } = spySubstrate();
    const { ledger } = memoryLedgerWithLog();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["AGENTS.md"],
      commitSha: to,
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error("expected an outcome");

    expect(absorbCalls).toHaveLength(1);
    const evidence = absorbCalls[0];
    if (evidence === undefined) throw new Error("expected evidence");
    expect(evidence.items).toContainEqual(
      expect.objectContaining({ kind: "decision", statement: "added Widget" }),
    );
    expect(evidence.items).toContainEqual(
      expect.objectContaining({
        kind: "absence",
        statement: "no test yet covered Widget's own shape",
        scope: { kind: "path", path: "src/widget.ts" },
        standing: "hypothesis",
      }),
    );
    expect(evidence.items).not.toContainEqual(
      expect.objectContaining({
        statement: "no test yet covered a nonexistent fourth source line",
      }),
    );
    expect(evidence.items).toContainEqual(
      expect.objectContaining({
        kind: "discipline",
        statement: "gate always-pass satisfied",
      }),
    );
    expect(Array.isArray(evidence.gaps)).toBe(true);
  });

  it("degrades to empty evidence, without failing the judgement, when the debrief's range is not real ancestor commits", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const { client, absorbCalls } = spySubstrate();
    const { ledger } = memoryLedgerWithLog();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error("expected an outcome");

    expect(absorbCalls).toEqual([
      {
        items: [
          {
            kind: "discipline",
            statement: "gate always-pass satisfied",
            standing: "observed",
            derivation: "gate:always-pass:runner@0:run-1",
          },
        ],
        gaps: [],
      },
    ]);
  });

  it("omits items and gaps from the acknowledgement request when there is truly no evidence", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const absorbedEvidence: (EvidenceForAbsorb | undefined)[] = [];
    const client: SubstrateClient = {
      address: "spy",
      context: () => Promise.resolve({ kind: "empty" }),
      absorb: (_node, _debrief, _notes, _receipts, evidence) => {
        absorbedEvidence.push(evidence);
        return Promise.resolve({ kind: "empty" });
      },
      prepareAbsorb: (_node, _debrief, _notes, _receipts, evidence) => {
        absorbedEvidence.push(evidence);
        return Promise.resolve({ kind: "none" });
      },
      capabilities: () => Promise.resolve([]),
    };
    const { ledger } = memoryLedgerWithLog();

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: [],
      commandFor: new Map(),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: () => {},
    });
    if (isErr(judged)) throw new Error("expected an outcome");

    expect(absorbedEvidence).toEqual([undefined]);
  });
});

describe("absorb narrates discoveries against the slice its brief carried", () => {
  it("counts a discovery known when the acknowledged response declares no placement of its own", async () => {
    const root = fixture();
    const debriefWithDiscovery = [
      "interlock: debrief@v2",
      "graph: fixture",
      "node: n1",
      "role: worker",
      `graph_base_sha: ${SHA}`,
      `session_start_sha: ${SHA}`,
      `head_sha: ${SHA}`,
      "derivation:",
      "  kind: agent",
      "  runtime: claude-code",
      "  model: claude-sonnet-5",
      "discoveries:",
      "  - id: d1",
      "    what: content.txt already carried a stale value",
      "    found_at: content.txt:1",
      "    mattered_because: the fixture needed a real hunk to cite",
      "decisions: []",
      "gates_run_by_agent: []",
      "open: []",
      "",
    ].join("\n");
    writeSession(root, "fixture", "n1", debriefWithDiscovery, notesYaml);
    const briefDir = join(root, ".interlock", "sessions", "fixture", "n1");
    writeFileSync(
      join(briefDir, "brief.md"),
      [
        "---",
        "interlock: brief@v1",
        "graph: fixture",
        "node: n1",
        "role: worker",
        "gates: []",
        "scope: []",
        "substrate:",
        "  address: spy",
        "---",
        "",
        "## Context slice",
        "",
        "### Discipline",
        "",
        "- [observed, repository] content.txt already named",
        "  derivation: human:Rodrigo",
        "",
      ].join("\n"),
    );

    const client: SubstrateClient = {
      address: "spy",
      context: () => Promise.resolve({ kind: "empty" }),
      absorb: () =>
        Promise.resolve({
          kind: "acknowledged",
          decisionsAbsorbed: [],
          discoveries: [],
          gaps: [],
        }),
      prepareAbsorb: () =>
        Promise.resolve({
          kind: "ready",
          target: "https://receiver.example/substrate@v1/absorb",
          request: "{}",
        }),
      dispatchAbsorb: () =>
        Promise.resolve({
          kind: "acknowledged",
          outcome: { kind: "acknowledged", decisionsAbsorbed: [], discoveries: [], gaps: [] },
          response: Buffer.from("{}"),
        }),
      capabilities: () => Promise.resolve([]),
    };
    const { ledger } = memoryLedgerWithLog(root);
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: (line) => narrated.push(line),
    });
    if (isErr(judged)) throw new Error("expected an outcome");

    expect(narrated).toContain(
      "absorb spy: 0 decision(s) absorbed, discoveries 1 known/0 unknown against the slice, 0 gap(s)",
    );
  });

  it("counts a discovery unknown when only a section outside the slice names its own reference", async () => {
    const root = fixture();
    const debriefWithDiscovery = [
      "interlock: debrief@v2",
      "graph: fixture",
      "node: n1",
      "role: worker",
      `graph_base_sha: ${SHA}`,
      `session_start_sha: ${SHA}`,
      `head_sha: ${SHA}`,
      "derivation:",
      "  kind: agent",
      "  runtime: claude-code",
      "  model: claude-sonnet-5",
      "discoveries:",
      "  - id: d1",
      "    what: notes.yaml records the session's own choices",
      "    found_at: notes.yaml",
      "    mattered_because: the fixture needed a reference the slice itself never states",
      "decisions: []",
      "gates_run_by_agent: []",
      "open: []",
      "",
    ].join("\n");
    writeSession(root, "fixture", "n1", debriefWithDiscovery, notesYaml);
    const briefDir = join(root, ".interlock", "sessions", "fixture", "n1");
    writeFileSync(
      join(briefDir, "brief.md"),
      [
        "---",
        "interlock: brief@v1",
        "graph: fixture",
        "node: n1",
        "role: worker",
        "gates: []",
        "scope: []",
        "substrate:",
        "  address: spy",
        "---",
        "",
        "## Context slice",
        "",
        "### Discipline",
        "",
        "- [observed, repository] content.txt already named",
        "  derivation: human:Rodrigo",
        "",
        "## Deliverable",
        "",
        "1. notes.yaml beside this brief, committed as you go.",
        "",
      ].join("\n"),
    );

    const client: SubstrateClient = {
      address: "spy",
      context: () => Promise.resolve({ kind: "empty" }),
      absorb: () =>
        Promise.resolve({
          kind: "acknowledged",
          decisionsAbsorbed: [],
          discoveries: [],
          gaps: [],
        }),
      prepareAbsorb: () =>
        Promise.resolve({
          kind: "ready",
          target: "https://receiver.example/substrate@v1/absorb",
          request: "{}",
        }),
      dispatchAbsorb: () =>
        Promise.resolve({
          kind: "acknowledged",
          outcome: { kind: "acknowledged", decisionsAbsorbed: [], discoveries: [], gaps: [] },
          response: Buffer.from("{}"),
        }),
      capabilities: () => Promise.resolve([]),
    };
    const { ledger } = memoryLedgerWithLog(root);
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: (line) => narrated.push(line),
    });
    if (isErr(judged)) throw new Error("expected an outcome");

    expect(narrated).toContain(
      "absorb spy: 0 decision(s) absorbed, discoveries 0 known/1 unknown against the slice, 0 gap(s)",
    );
  });
});

describe("judgement completes on a refused absorb", () => {
  it("still lands outcome-set and narrates the refusal when the node clears", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const client: SubstrateClient = {
      address: "spy",
      context: () => Promise.resolve({ kind: "empty" }),
      absorb: () => Promise.resolve({ kind: "refused", because: "stopped answering" }),
      prepareAbsorb: () => Promise.resolve({ kind: "refused", because: "stopped answering" }),
      capabilities: () => Promise.resolve([]),
    };
    const { ledger, events } = memoryLedgerWithLog();
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-pass"],
      commandFor: new Map([["always-pass", { kind: "command", run: passCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: (line) => narrated.push(line),
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    expect(events.map((event) => event.kind)).toContain("outcome-set");
    expect(narrated).toContain("absorb spy: refused, stopped answering");
  });

  it("still lands outcome-set and narrates the refusal when the node holds", async () => {
    const root = fixture();
    writeSession(root, "fixture", "n1", v2Debrief, notesYaml);
    const client: SubstrateClient = {
      address: "spy",
      context: () => Promise.resolve({ kind: "empty" }),
      absorb: () => Promise.resolve({ kind: "refused", because: "stopped answering" }),
      prepareAbsorb: () => Promise.resolve({ kind: "refused", because: "stopped answering" }),
      capabilities: () => Promise.resolve([]),
    };
    const { ledger, events } = memoryLedgerWithLog();
    const narrated: string[] = [];

    const judged = await judgeGates({
      ledger,
      clock: createControlledClock(),
      node,
      session: "s1",
      declaredGateIds: ["always-fail"],
      commandFor: new Map([["always-fail", { kind: "command", run: failCommand }]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
      substrate: client,
      narrate: (line) => narrated.push(line),
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    expect(events.map((event) => event.kind)).toContain("outcome-set");
    expect(narrated).toContain("absorb spy: refused, stopped answering");
  });
});
