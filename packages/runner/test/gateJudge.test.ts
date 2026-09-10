import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey, type Receipt } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { judgeGates } from "../src/gateJudge.ts";
import { memoryLedger, memoryLedgerWithLog } from "./support/memoryLedger.ts";

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

// Node itself, by its own already-running absolute path, rather than "true"/"false": these
// spawn through the runner's own `mise exec --` prefix, and a bare command name adds a second
// PATH lookup on top of that. process.execPath needs no lookup at all.
const passCommand = `${process.execPath} -e process.exit(0)`;
const failCommand = `${process.execPath} -e process.exit(1)`;

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
      commandFor: new Map([["always-pass", passCommand]]),
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
      session: "s1",
      declaredGateIds: ["always-fail"],
      commandFor: new Map([["always-fail", failCommand]]),
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
      session: "s1",
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
      session: "s1",
      declaredGateIds: ["foreign-none", "kept-local"],
      commandFor: new Map([["foreign-none", failCommand]]),
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
      commandFor: new Map([["echoes", "test {node} = n1"]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
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
      commandFor: new Map([["broken", "pnpm run {branch}"]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
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
      commandFor: new Map([["always-pass", passCommand]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const kinds = events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "debrief-filed")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "note-appended")).toHaveLength(1);
    expect(kinds.indexOf("debrief-filed")).toBeLessThan(
      kinds.indexOf("outcome-set"),
    );
    expect(kinds.indexOf("note-appended")).toBeLessThan(
      kinds.indexOf("outcome-set"),
    );

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
      commandFor: new Map([["always-pass", passCommand]]),
      worktree: root,
      scopeRoot: root,
      scopePaths: ["content.txt"],
      commitSha: "deadbeef",
      runnerId: "run-1",
      holdMs: 60_000,
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
    const kinds = events.map((event) => event.kind);
    expect(kinds).not.toContain("debrief-filed");
    expect(kinds).not.toContain("note-appended");
  });
});
