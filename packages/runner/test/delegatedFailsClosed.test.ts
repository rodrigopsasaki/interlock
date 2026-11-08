import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { nodeKey, type Receipt } from "ledger";
import { noneClient } from "substrate";
import { afterEach, describe, expect, it } from "vitest";
import type { GateCommand } from "../src/gateCommand.ts";
import { judgeGates } from "../src/gateJudge.ts";
import { gitInitFixtureWithContent } from "./support/gitFixture.ts";
import { memoryLedger } from "./support/memoryLedger.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

const node = { graph: "fixture", id: "n1" };
const graphRelativePath = join(".interlock", "graphs", "fixture.yaml");
const removeGraphCommand = `${process.execPath} -e require("node:fs").unlinkSync(".interlock/graphs/fixture.yaml")`;
const rewriteGraphCommand = `${process.execPath} -e require("node:fs").writeFileSync(".interlock/graphs/fixture.yaml","H2\\n")`;

let directories: string[] = [];

afterEach(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
  directories = [];
});

function fixture(): {
  readonly authoritative: string;
  readonly worktree: string;
  readonly graphHash: string;
} {
  const authoritative = mkdtempSync(join(runsRoot, "delegated-authoritative-"));
  const worktree = mkdtempSync(join(runsRoot, "delegated-worktree-"));
  directories = [authoritative, worktree];
  for (const root of [authoritative, worktree]) {
    mkdirSync(join(root, ".interlock", "graphs"), { recursive: true });
    writeFileSync(join(root, "content.txt"), "content\n");
    writeFileSync(join(root, graphRelativePath), "H1\n");
  }
  gitInitFixtureWithContent(worktree);
  const graphHash = createHash("sha256")
    .update(readFileSync(join(authoritative, graphRelativePath)))
    .digest("hex");
  return { authoritative, worktree, graphHash };
}

function delegatedReceipt(graphHash: string, gate = "witnessed"): Receipt {
  return {
    id: `receipt-${gate}`,
    gate,
    commitSha: "deadbeef",
    spend: { kind: "none" },
    duration: { kind: "unknown" },
    derivation: {
      kind: "human",
      who: "Gilb for Rodrigo Sasaki",
      for: "Rodrigo Sasaki",
      cite: `said:clear-${gate}`,
      citeKey: `said:clear-${gate}`,
      author: "Rodrigo Sasaki",
      words: "clear witnessed",
      at: "2026-11-08T08:00:00Z",
      reading: "I read the words as clearance",
      action: "clear",
      target: { graph: "fixture", node: "n1", gate },
      contentHash: graphHash,
    },
    proof: {},
  };
}

function seedDelegated(graphHash: string, gate = "witnessed") {
  const ledger = memoryLedger();
  const receipt = delegatedReceipt(graphHash, gate);
  ledger.append({ kind: "receipt-written", node, receipt });
  ledger.append({ kind: "gate-moved", node, gate, to: { kind: "satisfied", receipt } });
  return { ledger, receipt };
}

function request(
  root: ReturnType<typeof fixture>,
  ledger: ReturnType<typeof memoryLedger>,
  commandFor: ReadonlyMap<string, GateCommand>,
  declaredGateIds: readonly string[] = ["witnessed"],
  scopePaths: readonly string[] = ["content.txt"],
) {
  return {
    ledger,
    clock: createControlledClock(),
    node,
    session: "s1",
    declaredGateIds,
    commandFor,
    worktree: root.worktree,
    authoritativeGraphPath: join(root.authoritative, graphRelativePath),
    parsedGraphHash: root.graphHash,
    scopeRoot: root.worktree,
    scopePaths,
    commitSha: "deadbeef",
    runnerId: "run-1",
    holdMs: 60_000,
    substrate: noneClient(),
    narrate: () => {},
  };
}

const humanGate = { kind: "human" as const, run: "" };

describe("delegated graph clearance", () => {
  it("counts while authoritative, worktree, and parsed graph bytes are unchanged", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    const judged = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
  });

  it.each([
    [
      "worktree graph is missing",
      (root: ReturnType<typeof fixture>) => unlinkSync(join(root.worktree, graphRelativePath)),
    ],
    [
      "worktree graph is a directory",
      (root: ReturnType<typeof fixture>) => {
        unlinkSync(join(root.worktree, graphRelativePath));
        mkdirSync(join(root.worktree, graphRelativePath));
      },
    ],
    [
      "authoritative graph is missing",
      (root: ReturnType<typeof fixture>) => unlinkSync(join(root.authoritative, graphRelativePath)),
    ],
  ])("holds when %s", async (_name, change) => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    change(root);
    const judged = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
    expect(ledger.projection().nodes.get(nodeKey(node))?.gates.get("witnessed")).toEqual({
      kind: "pending",
    });
  });

  it("holds when the authoritative graph differs from the bound worktree graph", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    writeFileSync(join(root.authoritative, graphRelativePath), "H2\n");
    const judged = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
  });

  it("holds when parsed declarations came from bytes different from both live copies", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    const judged = await judgeGates({
      ...request(root, ledger, new Map([["witnessed", humanGate]])),
      parsedGraphHash: "h2",
    });

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
  });

  it("leaves an owner's own clearance counting when the worktree graph is missing", async () => {
    const root = fixture();
    const ledger = memoryLedger();
    const receipt: Receipt = {
      ...delegatedReceipt(root.graphHash),
      id: "owner-clearance",
      derivation: { kind: "human", who: "Rodrigo Sasaki" },
    };
    ledger.append({ kind: "receipt-written", node, receipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "witnessed",
      to: { kind: "satisfied", receipt },
    });
    unlinkSync(join(root.worktree, graphRelativePath));

    const judged = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("cleared");
  });

  it("restores a stale delegated clearance when the bound graph returns", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    writeFileSync(join(root.worktree, graphRelativePath), "H2\n");
    const held = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));
    if (isErr(held)) throw new Error("expected an outcome");
    expect(held.value.kind).toBe("held");

    writeFileSync(join(root.worktree, graphRelativePath), "H1\n");
    const cleared = await judgeGates(request(root, ledger, new Map([["witnessed", humanGate]])));
    if (isErr(cleared)) throw new Error("expected an outcome");
    expect(cleared.value.kind).toBe("cleared");
  });

  it("holds after a passing command rewrites the worktree graph", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    const judged = await judgeGates(
      request(
        root,
        ledger,
        new Map([
          ["witnessed", humanGate],
          ["rewrite", { kind: "command", run: rewriteGraphCommand }],
        ]),
        ["witnessed", "rewrite"],
      ),
    );

    if (isErr(judged)) throw new Error("expected an outcome");
    expect(judged.value.kind).toBe("held");
  });

  it("holds and refuses when a passing command removes a tracked graph", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    const judged = await judgeGates(
      request(
        root,
        ledger,
        new Map([
          ["witnessed", humanGate],
          ["remove", { kind: "command", run: removeGraphCommand }],
        ]),
        ["witnessed", "remove"],
        ["content.txt", graphRelativePath],
      ),
    );

    expect(isErr(judged)).toBe(true);
    expect(ledger.projection().nodes.get(nodeKey(node))?.outcome?.kind).toBe("held");
  });

  it("keeps the node held after a placeholder refusal moves a delegated clearance pending", async () => {
    const root = fixture();
    const { ledger } = seedDelegated(root.graphHash);
    writeFileSync(join(root.worktree, graphRelativePath), "H2\n");
    const judged = await judgeGates(
      request(
        root,
        ledger,
        new Map([
          ["witnessed", humanGate],
          ["placeholder", { kind: "command", run: "echo {unknown}" }],
        ]),
        ["witnessed", "placeholder"],
      ),
    );

    expect(isErr(judged)).toBe(true);
    expect(ledger.projection().nodes.get(nodeKey(node))?.outcome?.kind).toBe("held");
    expect(ledger.projection().nodes.get(nodeKey(node))?.gates.get("witnessed")).toEqual({
      kind: "pending",
    });
  });
});
