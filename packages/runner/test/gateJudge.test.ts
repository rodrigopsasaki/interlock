import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey, type Receipt } from "ledger";
import type { AbsorbOutcome, EvidenceForAbsorb, SubstrateClient } from "substrate";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { commitAll, gitInitFixtureWithContent, headSha } from "./support/gitFixture.ts";
import { memoryLedger, memoryLedgerWithLog } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const substrate = noneClient();

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "gate-"));
  writeFileSync(join(directory, "content.txt"), "hello\n");
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
    expect(receipt?.proof).toEqual({
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
    expect(receipt?.proof).toEqual({
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

  it("ingests a v2 debrief only once, when the same session is judged a second time", async () => {
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
      "    what: no test yet covered Widget's own shape",
      "    found_at: src/widget.ts",
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
      capabilities: () => Promise.resolve([]),
    };
    const { ledger } = memoryLedgerWithLog();
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
      capabilities: () => Promise.resolve([]),
    };
    const { ledger } = memoryLedgerWithLog();
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
