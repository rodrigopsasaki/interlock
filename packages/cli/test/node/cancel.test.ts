import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import { createLedger, outcome, type Ledger } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { gitInitFixture } from "../graph/gitFixture.ts";
import { runNodeCancel } from "../../src/node/cancel.ts";

const runsRoot = join(import.meta.dirname, "..", ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
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
  directory = mkdtempSync(join(runsRoot, "node-cancel-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    graphYaml,
  );
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
  const raw = readFileSync(
    join(cwd, ".interlock", "ledger", "journal.jsonl"),
    "utf-8",
  );
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

describe("node cancel", () => {
  it("refuses without --because", async () => {
    const cwd = fixture();
    const result = await runNodeCancel(
      ["demo", "a", "--by", "Rodrigo Sasaki"],
      {
        cwd,
      },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock node cancel: refuses without --because; every cancellation records why.",
    );
  });

  it("refuses without --by", async () => {
    const cwd = fixture();
    const result = await runNodeCancel(
      ["demo", "a", "--because", "acceptance dropped"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "interlock node cancel: refuses without --by; every cancellation records who.",
    );
  });

  it("refuses on an unknown graph", async () => {
    const cwd = fixture();
    const result = await runNodeCancel(
      [
        "ghost",
        "a",
        "--by",
        "Rodrigo Sasaki",
        "--because",
        "acceptance dropped",
      ],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("no such file");
  });

  it("refuses on an unknown node", async () => {
    const cwd = fixture();
    const result = await runNodeCancel(
      [
        "demo",
        "ghost",
        "--by",
        "Rodrigo Sasaki",
        "--because",
        "acceptance dropped",
      ],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain(
      'no node "ghost" declared on graph "demo"',
    );
  });

  it("appends exactly an outcome-set event when no outcome exists yet", async () => {
    const cwd = fixture();
    const result = await runNodeCancel(
      [
        "demo",
        "a",
        "--by",
        "Rodrigo Sasaki",
        "--because",
        "acceptance dropped",
      ],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("a: cancelled by Rodrigo Sasaki.");
    expect(journalEventKinds(cwd)).toEqual(["outcome-set"]);
  });

  it("cancels a node held on a failed gate", async () => {
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
          disposition: "hold",
        },
        "typecheck failed",
        30_000,
      ),
    });
    await ledger.close();

    const result = await runNodeCancel(
      [
        "demo",
        "a",
        "--by",
        "Rodrigo Sasaki",
        "--because",
        "abandoning this attempt",
      ],
      { cwd },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe("a: cancelled by Rodrigo Sasaki.");
  });

  it("refuses to cancel a cleared node, naming the terminal rule", async () => {
    const cwd = fixture();
    const ledger = await openLedger(cwd);
    ledger.append({
      kind: "outcome-set",
      node: { graph: "demo", id: "a" },
      outcome: { kind: "cleared", receipts: [] },
    });
    await ledger.close();

    const result = await runNodeCancel(
      ["demo", "a", "--by", "Rodrigo Sasaki", "--because", "changed my mind"],
      { cwd },
    );
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toBe(
      "a: outcome cannot move from cleared, which is terminal.",
    );
  });
});
