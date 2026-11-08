import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { createLedger, derivation, gate } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runGateClear } from "../src/gate/clear.ts";
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
  "    depends_on: []",
  "    gates:",
  "      - id: witnessed",
  "        kind: human",
  "",
].join("\n");

function fixture(): { readonly cwd: string; readonly machine: string } {
  directory = mkdtempSync(join(runsRoot, "consumed-cite-"));
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

function args(node: string, cite: string): string[] {
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

async function movePending(cwd: string): Promise<void> {
  const opened = await createLedger({
    clock: createSystemClock(),
    directory: join(cwd, ".interlock", "ledger"),
  });
  if (isErr(opened)) throw new Error("expected ledger");
  const ledger = opened.value;
  ledger.append({
    kind: "gate-moved",
    node: { graph: "demo", id: "a" },
    gate: "witnessed",
    to: gate.pending(),
  });
  await ledger.close();
}

async function replaceWithOwnerReceipt(cwd: string): Promise<void> {
  const opened = await createLedger({
    clock: createSystemClock(),
    directory: join(cwd, ".interlock", "ledger"),
  });
  if (isErr(opened)) throw new Error("expected ledger");
  const ledger = opened.value;
  ledger.append({
    kind: "gate-moved",
    node: { graph: "demo", id: "a" },
    gate: "witnessed",
    to: gate.satisfied({
      id: "owner-receipt",
      gate: "witnessed",
      commitSha: "commit",
      spend: { kind: "none" },
      duration: { kind: "unknown" },
      derivation: derivation.human("owner"),
      proof: {},
    }),
  });
  await ledger.close();
}

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("consumed delegated cites", () => {
  it.each(["pending", "replaced", "retracted"])("refuses reuse after %s", async (state) => {
    const { cwd, machine } = fixture();
    const first = await runGateClear(args("a", state), { cwd, machinePath: machine });
    expect(first, first.message).toMatchObject({ exitCode: 0 });
    if (state === "pending") await movePending(cwd);
    if (state === "replaced") await replaceWithOwnerReceipt(cwd);
    if (state === "retracted") {
      const retracted = await runReceiptRetract(
        ["demo", "a", "witnessed", "--by", "owner", "--because", "retract"],
        { cwd },
      );
      expect(retracted.exitCode).toBe(0);
    }
    const reused = await runGateClear(args("b", state), { cwd, machinePath: machine });
    expect(reused.exitCode).toBe(1);
    expect(reused.message).toContain("already authorized clear");
    expect(readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf8")).toContain(
      `said:${state}`,
    );
  });
});
