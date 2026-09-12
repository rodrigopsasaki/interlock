import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, type Ledger, outcome } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runNodeReset } from "../../src/node/reset.ts";
import { gitInitFixture } from "../graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

const graphYaml = [
  "interlock: graph@v0",
  "id: demo",
  "gates:",
  "  - id: approved",
  "    kind: human",
  "nodes:",
  "  - id: a",
  "    depends_on: []",
  "",
].join("\n");

function fixture(): string {
  directory = mkdtempSync(join(runsRoot, "node-reset-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(join(directory, ".interlock", "graphs", "demo.yaml"), graphYaml);
  return directory;
}

async function openLedger(cwd: string): Promise<Ledger> {
  return unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: sharedJournalDirectory(cwd),
    }),
  );
}

function journalEventKinds(cwd: string): readonly string[] {
  const raw = readFileSync(join(cwd, ".interlock", "ledger", "journal.jsonl"), "utf-8");
  return raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line): string => {
      const parsed: unknown = JSON.parse(line);
      return typeof parsed === "object" && parsed !== null && "kind" in parsed
        ? String(parsed["kind"])
        : "";
    });
}

describe("node reset", () => {
  it("refuses without --because", async () => {
    const cwd = fixture();
    const result = await runNodeReset(["demo", "a", "--by", "Rodrigo Sasaki"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock node reset: refuses without --because; every reset records why.",
    );
  });

  it("refuses without --by", async () => {
    const cwd = fixture();
    const result = await runNodeReset(["demo", "a", "--because", "flaky suite, re-running"], {
      cwd,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock node reset: refuses without --by; every reset records who.",
    );
  });

  it("refuses on an unknown graph", async () => {
    const cwd = fixture();
    const result = await runNodeReset(
      ["ghost", "a", "--by", "Rodrigo Sasaki", "--because", "flaky suite"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses on an unknown node", async () => {
    const cwd = fixture();
    const result = await runNodeReset(
      ["demo", "ghost", "--by", "Rodrigo Sasaki", "--because", "flaky suite"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain('no node "ghost" declared on graph "demo"');
  });

  it("refuses a node with no outcome yet, naming that there is nothing to reset", async () => {
    const cwd = fixture();
    const result = await runNodeReset(
      ["demo", "a", "--by", "Rodrigo Sasaki", "--because", "flaky suite"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe("a: has no outcome yet; nothing to reset.");
  });

  it("refuses a node under a live lease, naming the session and its expiry", async () => {
    const cwd = fixture();
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "session-started",
      session: { id: "session-1", node: { graph: "demo", id: "a" } },
      brief: {
        graph: "demo",
        node: "a",
        role: "worker",
        acceptance: "",
        gates: [],
        scope: [],
      },
    });
    ledger.append({
      kind: "lease-taken",
      node: { graph: "demo", id: "a" },
      session: "session-1",
      expiry: 60_000,
    });
    await ledger.close();

    const result = await runNodeReset(
      ["demo", "a", "--by", "Rodrigo Sasaki", "--because", "stuck"],
      { cwd, clock: createControlledClock({ initialTime: 1_000 }) },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      `a is leased by session session-1 until ${new Date(60_000).toISOString()}; wait for it or run interlock sweep.`,
    );
  });

  it("resets a node held on a failed gate", async () => {
    const cwd = fixture();
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "outcome-set",
      node: { graph: "demo", id: "a" },
      outcome: outcome.held(
        [],
        {
          kind: "gate-failure",
          failure: "typecheck failed",
          disposition: "retry",
        },
        "typecheck failed",
        30_000,
      ),
    });
    await ledger.close();

    const result = await runNodeReset(
      ["demo", "a", "--by", "Rodrigo Sasaki", "--because", "fixed upstream"],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("a: reset by Rodrigo Sasaki.");
    expect(journalEventKinds(cwd)).toEqual(["outcome-set", "outcome-set"]);
  });

  it("refuses to reset a cleared node, naming the terminal rule", async () => {
    const cwd = fixture();
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "outcome-set",
      node: { graph: "demo", id: "a" },
      outcome: { kind: "cleared", receipts: [] },
    });
    await ledger.close();

    const result = await runNodeReset(
      ["demo", "a", "--by", "Rodrigo Sasaki", "--because", "want it re-run"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe("a: outcome cannot move from cleared, which is terminal.");
  });
});
