import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { createLedger, heldOn, type LedgerEvent, nodeKey, type Outcome, outcome } from "ledger";
import { unmetDependencies } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { runGateClear } from "../src/gate/clear.ts";
import { runInterlockPosition } from "../src/position.ts";
import { runReceiptRetract } from "../src/receipt/retract.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

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
  "      - id: witnessed",
  "        kind: human",
  "  - id: b",
  "    depends_on: [a]",
  "    gates:",
  "      - id: witnessed",
  "        kind: human",
  "  - id: c",
  "    depends_on: []",
  "    gates:",
  "      - id: witnessed",
  "        kind: human",
  "  - id: d",
  "    depends_on: []",
  "    gates:",
  "      - id: witnessed",
  "        kind: human",
  "",
].join("\n");

function fixture(): { readonly cwd: string; readonly machine: string } {
  directory = mkdtempSync(join(runsRoot, "retraction-holds-outcome-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  writeFileSync(
    join(directory, ".interlock", "config.yaml"),
    "interlock: config@v0\nstanding_gates: []\n",
  );
  writeFileSync(
    join(directory, ".interlock", "local.yaml"),
    [
      "interlock: local@v1",
      "runtime:",
      "  kind: claude",
      "  worktree_root: .worktrees",
      "  lease_ms: 1000",
      "  run_timeout_ms: 1000",
      "substrate:",
      "  address: none",
      "owner_login: owner",
      "",
    ].join("\n"),
  );
  const provider = join(directory, "cite-provider.mjs");
  writeFileSync(
    provider,
    "process.stdout.write(JSON.stringify({verified:true,author:'owner',words:'words',at:'2026-11-08T00:00:00Z'}));\n",
  );
  const machine = join(directory, "machine.yaml");
  writeFileSync(
    machine,
    [
      "interlock: machine@v0",
      "provider:",
      "  admit: [admit]",
      "  release: [release]",
      "  env: [env]",
      "  heavy: [heavy]",
      "  cite:",
      `    - ${JSON.stringify(process.execPath)}`,
      `    - ${JSON.stringify(provider)}`,
      "    - '{kind}'",
      "    - '{id}'",
      "",
    ].join("\n"),
  );
  return { cwd: directory, machine };
}

function clearArgs(node: string, cite: string): string[] {
  return [
    "demo",
    node,
    "witnessed",
    "--by",
    "driver",
    "--because",
    "because",
    "--for",
    "owner",
    "--cites",
    `said:${cite}`,
    "--reading",
    "clear witnessed",
  ];
}

async function appendEvent(cwd: string, event: LedgerEvent): Promise<void> {
  const opened = await createLedger({
    clock: createSystemClock(),
    directory: join(cwd, ".interlock", "ledger"),
  });
  if (isErr(opened)) throw new Error("expected ledger");
  const ledger = opened.value;
  try {
    ledger.append(event);
  } finally {
    await ledger.close();
  }
}

async function appendOutcome(cwd: string, node: { graph: string; id: string }, next: Outcome) {
  await appendEvent(cwd, { kind: "outcome-set", node, outcome: next });
}

async function replay(cwd: string) {
  const opened = await createLedger({
    clock: createSystemClock(),
    directory: join(cwd, ".interlock", "ledger"),
  });
  if (isErr(opened)) throw new Error("expected ledger");
  const ledger = opened.value;
  try {
    return ledger.projection();
  } finally {
    await ledger.close();
  }
}

function journalEvents(cwd: string): readonly Record<string, unknown>[] {
  return readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) throw new Error("expected journal object");
      return parsed;
    });
}

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("receipt retraction projection", () => {
  it("holds a cleared node on replay, leaves one append, reports dependencies, and consumes its cite", async () => {
    const { cwd, machine } = fixture();
    const cleared = await runGateClear(clearArgs("a", "cleared"), {
      cwd,
      machinePath: machine,
    });
    expect(cleared, cleared.message).toMatchObject({ exitCode: 0 });

    const beforeOutcome = await replay(cwd);
    const satisfied = beforeOutcome.nodes
      .get(nodeKey({ graph: "demo", id: "a" }))
      ?.gates.get("witnessed");
    if (satisfied?.kind !== "satisfied") throw new Error("expected delegated receipt");
    await appendOutcome(
      cwd,
      { graph: "demo", id: "a" },
      {
        kind: "cleared",
        receipts: [satisfied.receipt],
      },
    );

    const beforeRetraction = journalEvents(cwd);
    const retracted = await runReceiptRetract(
      ["demo", "a", "witnessed", "--by", "owner", "--because", "withdraw"],
      { cwd },
    );
    expect(retracted).toMatchObject({ exitCode: 0 });
    const afterRetraction = journalEvents(cwd);
    expect(afterRetraction).toHaveLength(beforeRetraction.length + 1);
    expect(afterRetraction.at(-1)).toMatchObject({ kind: "receipt-retracted" });

    const projected = await replay(cwd);
    const node = projected.nodes.get(nodeKey({ graph: "demo", id: "a" }));
    expect(node?.gates.get("witnessed")).toEqual({ kind: "pending" });
    expect(node?.outcome).toEqual({
      kind: "held",
      receipts: [satisfied.receipt],
      on: { kind: "gate-failure", failure: "witnessed", disposition: "hold" },
      because: "witnessed: awaits a person; a person's verb clears it.",
      expiry: 0,
    });
    expect(unmetDependencies("demo", ["a"], projected)).toEqual(["a"]);
    expect(projected.consumedCites.has("said:cleared")).toBe(true);

    const positionResult = await runInterlockPosition(["--json", "--repo", cwd], { cwd });
    const position: unknown = JSON.parse(positionResult.message);
    if (!isRecord(position)) throw new Error("expected positions object");
    const repositories = position["repositories"];
    if (!Array.isArray(repositories) || repositories.length !== 1) {
      throw new Error("expected one repository position");
    }
    const repository = repositories[0];
    if (!isRecord(repository)) throw new Error("expected repository position");
    const graphs = repository["graphs"];
    if (!Array.isArray(graphs) || graphs.length !== 1) throw new Error("expected graph position");
    const graph = graphs[0];
    if (!isRecord(graph) || !isRecord(graph["position"])) throw new Error("expected graph read");
    const positionRead = graph["position"];
    if (!isRecord(positionRead)) throw new Error("expected graph position");
    const nodes = positionRead["nodes"];
    if (!Array.isArray(nodes)) throw new Error("expected position nodes");
    const positioned = nodes.find(
      (candidate): candidate is Record<string, unknown> =>
        isRecord(candidate) && candidate["id"] === "a",
    );
    expect(positioned?.["state"]).toMatchObject({ kind: "outcome", outcome: { kind: "held" } });

    const reused = await runGateClear(clearArgs("b", "cleared"), {
      cwd,
      machinePath: machine,
    });
    expect(reused.exitCode).toBe(1);
    expect(reused.message).toContain("already authorized clear");
  });

  it("does not replace a non-cleared outcome or a mismatched satisfied receipt", async () => {
    const { cwd, machine } = fixture();
    const notCleared = await runGateClear(clearArgs("c", "not-cleared"), {
      cwd,
      machinePath: machine,
    });
    expect(notCleared, notCleared.message).toMatchObject({ exitCode: 0 });
    const held = outcome.held([], heldOn.decision("owner"), "waiting", 42);
    await appendOutcome(cwd, { graph: "demo", id: "c" }, held);
    const retractedNotCleared = await runReceiptRetract(
      ["demo", "c", "witnessed", "--by", "owner", "--because", "withdraw"],
      { cwd },
    );
    expect(retractedNotCleared.exitCode).toBe(0);
    const afterNotCleared = await replay(cwd);
    const c = afterNotCleared.nodes.get(nodeKey({ graph: "demo", id: "c" }));
    expect(c?.outcome).toEqual(held);
    expect(c?.gates.get("witnessed")).toEqual({ kind: "pending" });

    const mismatch = await runGateClear(clearArgs("d", "mismatch"), {
      cwd,
      machinePath: machine,
    });
    expect(mismatch, mismatch.message).toMatchObject({ exitCode: 0 });
    const beforeMismatch = await replay(cwd);
    const d = beforeMismatch.nodes.get(nodeKey({ graph: "demo", id: "d" }));
    const dGate = d?.gates.get("witnessed");
    if (dGate?.kind !== "satisfied") throw new Error("expected receipt");
    const dReceipt = dGate.receipt;
    await appendOutcome(
      cwd,
      { graph: "demo", id: "d" },
      {
        kind: "cleared",
        receipts: [dReceipt],
      },
    );
    await appendEvent(cwd, {
      kind: "receipt-retracted",
      node: { graph: "demo", id: "d" },
      gate: "witnessed",
      receiptId: "not-the-satisfied-receipt",
      by: "owner",
      because: "withdraw",
    });
    const afterMismatch = await replay(cwd);
    const dAfter = afterMismatch.nodes.get(nodeKey({ graph: "demo", id: "d" }));
    expect(dAfter?.gates.get("witnessed")).toEqual(dGate);
    expect(dAfter?.outcome).toEqual({
      kind: "cleared",
      receipts: [dReceipt],
    });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
