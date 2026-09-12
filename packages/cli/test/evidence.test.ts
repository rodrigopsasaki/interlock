import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { sharedJournalDirectory } from "face";
import {
  type Brief,
  createLedger,
  type Debrief,
  derivation,
  duration,
  gate,
  type Ledger,
  spend,
} from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runInterlockEvidence } from "../src/evidence.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined)
    rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function git(args: readonly string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "fixture",
      GIT_AUTHOR_EMAIL: "fixture@example.invalid",
      GIT_COMMITTER_NAME: "fixture",
      GIT_COMMITTER_EMAIL: "fixture@example.invalid",
    },
  });
}

const AGENTS_MD = [
  "## Vocabulary",
  "",
  "| term | means |",
  "| --- | --- |",
  "| widget | A thing. |",
  "",
  "## Next",
  "",
].join("\n");

function initFixtureRepo(directory: string): void {
  git(["-c", "init.defaultBranch=main", "init", "--quiet"], directory);
  writeFileSync(join(directory, "AGENTS.md"), AGENTS_MD);
  git(["add", "-A"], directory);
  git(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "root"],
    directory,
  );
}

function fixtureRepo(): {
  readonly dir: string;
  readonly from: string;
  readonly to: string;
} {
  directory = mkdtempSync(join(runsRoot, "evidence-"));
  initFixtureRepo(directory);
  const from = git(["rev-parse", "HEAD"], directory).trim();

  mkdirSync(join(directory, "src"), { recursive: true });
  writeFileSync(
    join(directory, "src/widget.ts"),
    ["export interface Widget {", "  readonly id: string;", "}", ""].join("\n"),
  );
  git(["add", "-A"], directory);
  git(
    ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "add widget"],
    directory,
  );
  const to = git(["rev-parse", "HEAD"], directory).trim();

  return { dir: directory, from, to };
}

async function openLedger(cwd: string): Promise<Ledger> {
  return unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: sharedJournalDirectory(cwd),
    }),
  );
}

const node = { graph: "0003-translator", id: "evidence" };

const brief: Brief = {
  graph: node.graph,
  node: node.id,
  role: "worker",
  acceptance: "fixture",
  gates: ["typecheck"],
  scope: [],
};

function fixtureDebrief(from: string, to: string): Debrief {
  return {
    graph: node.graph,
    node: node.id,
    role: "worker",
    graphBaseSha: from,
    sessionStartSha: from,
    headSha: to,
    derivation: {
      kind: "agent",
      runtime: "claude-code",
      model: "claude-sonnet-5",
    },
    discoveries: [
      {
        id: "d1",
        what: "no test yet covered Widget's own shape",
        foundAt: "src/widget.ts",
        matteredBecause: "the acceptance asked for it",
      },
    ],
    decisions: [
      {
        id: "c1",
        what: "added Widget",
        because: "the acceptance asked for it",
        restsOn: [],
        hunks: ["src/widget.ts:1-3"],
      },
    ],
    gatesRunByAgent: [],
    open: [],
  };
}

const satisfiedReceipt = {
  id: "r1",
  gate: "typecheck",
  commitSha: "a".repeat(40),
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("typecheck", "runner@0", "run-1"),
  proof: { exitCode: 0 },
};

describe("interlock evidence", () => {
  it("refuses with a sentence when no graph or node is given", async () => {
    const result = await runInterlockEvidence([]);
    expect(result.exitCode).not.toBe(0);
    expect(result.message).toContain("interlock evidence");
  });

  it("prints a sentence, exit 0, when no session is recorded for the node", async () => {
    directory = mkdtempSync(join(runsRoot, "evidence-"));
    initFixtureRepo(directory);
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    const result = await runInterlockEvidence([node.graph, node.id], {
      cwd: directory,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toBe(
      `${node.graph}/${node.id}: no judged session recorded for this node.`,
    );
  });

  it("prints a sentence when --session names a session not recorded for this node", async () => {
    directory = mkdtempSync(join(runsRoot, "evidence-"));
    initFixtureRepo(directory);
    mkdirSync(join(directory, ".interlock"), { recursive: true });
    const result = await runInterlockEvidence(
      [node.graph, node.id, "--session", "bogus"],
      {
        cwd: directory,
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("bogus");
  });

  it("prints the header and the items for a cleared, judged session", async () => {
    const { dir, from, to } = fixtureRepo();
    const debrief = fixtureDebrief(from, to);
    const ledger = await openLedger(dir);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
    });
    ledger.append({ kind: "debrief-filed", session: "s1", debrief });
    ledger.append({ kind: "receipt-written", node, receipt: satisfiedReceipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "typecheck",
      to: gate.satisfied(satisfiedReceipt),
    });
    ledger.append({
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [satisfiedReceipt] },
    });
    await ledger.close();

    const result = await runInterlockEvidence([node.graph, node.id], {
      cwd: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toMatch(
      /^items 3 \(discipline\/observed 1, decision\/hypothesis 1, absence\/hypothesis 1\), gaps \d+, unrooted excluded 0/,
    );
    expect(result.message).toContain("kind: discipline");
    expect(result.message).toContain("statement: gate typecheck satisfied");
    expect(result.message).toContain("kind: decision");
    expect(result.message).toContain("statement: added Widget");
    expect(result.message).toContain("kind: absence");
    expect(result.message).toContain(
      "derivation: agent:claude-code:claude-sonnet-5",
    );
  });

  it("carries a person's waiver into evidence as a professed decision", async () => {
    const { dir, from, to } = fixtureRepo();
    const debrief = fixtureDebrief(from, to);
    const waivedReceipt = { ...satisfiedReceipt, id: "r2" };
    const ledger = await openLedger(dir);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
    });
    ledger.append({ kind: "debrief-filed", session: "s1", debrief });
    ledger.append({ kind: "receipt-written", node, receipt: waivedReceipt });
    ledger.append({
      kind: "gate-moved",
      node,
      gate: "typecheck",
      to: gate.waived("Rodrigo Sasaki", "flaky today", waivedReceipt),
    });
    ledger.append({
      kind: "outcome-set",
      node,
      outcome: { kind: "cleared", receipts: [waivedReceipt] },
    });
    await ledger.close();

    const result = await runInterlockEvidence([node.graph, node.id], {
      cwd: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("statement: waived gate typecheck");
    expect(result.message).toContain("because: flaky today");
    expect(result.message).toContain("derivation: human:Rodrigo Sasaki");
  });
});
