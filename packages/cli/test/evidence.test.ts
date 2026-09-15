import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
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
  OUTBOX_INTENT_SHAPE,
  retainOutboxArtifact,
  spend,
} from "ledger";
import { ABANDONED_AUTHORITY } from "runner";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { runInterlockEvidence } from "../src/evidence.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
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
  git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "root"], directory);
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
  git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "add widget"], directory);
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

function recordIntent(
  ledger: Ledger,
  target: { readonly graph: string; readonly id: string },
  session: string,
  id: string,
  payload: string,
) {
  const request = unwrap(retainOutboxArtifact(ledger.directory(), "request", Buffer.from(payload)));
  ledger.append({
    kind: "outbox-intent-recorded",
    node: target,
    effect: {
      interlock: OUTBOX_INTENT_SHAPE,
      id,
      node: target,
      session,
      target: "https://target.example.invalid/SECRET-TARGET",
      request,
      derivation: derivation.gate("outbox", "runner@0", "runner"),
    },
  });
  return request;
}

function recordAcknowledgment(ledger: Ledger, id: string, payload: string) {
  const acknowledgment = unwrap(
    retainOutboxArtifact(ledger.directory(), "acknowledgment", Buffer.from(payload)),
  );
  ledger.append({
    kind: "outbox-delivery-recorded",
    delivery: {
      id,
      state: "acknowledged",
      because: "SECRET-BECAUSE",
      derivation: derivation.gate("outbox", "runner@0", "runner"),
      acknowledgment,
    },
  });
  return acknowledgment;
}

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
    const result = await runInterlockEvidence([node.graph, node.id, "--session", "bogus"], {
      cwd: directory,
    });
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
    expect(result.message).toContain("derivation: agent:claude-code:claude-sonnet-5");
    expect(result.message).toMatch(/scope:\s*\n\s*kind: path\s*\n\s*path: src\/widget\.ts/);
  });

  it("is deterministic: two runs over the same journal print identical text", async () => {
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

    const first = await runInterlockEvidence([node.graph, node.id], { cwd: dir });
    const second = await runInterlockEvidence([node.graph, node.id], { cwd: dir });
    expect(first).toEqual(second);
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

  it("a sweeper cancellation is never a professed item", async () => {
    const { dir, from, to } = fixtureRepo();
    const debrief = fixtureDebrief(from, to);
    const ledger = await openLedger(dir);
    ledger.append({
      kind: "session-started",
      session: { id: "s1", node },
      brief,
    });
    ledger.append({ kind: "debrief-filed", session: "s1", debrief });
    ledger.append({
      kind: "outcome-set",
      node,
      outcome: {
        kind: "cancelled",
        receipts: [],
        authority: ABANDONED_AUTHORITY,
        because: "lease s1 expired at 0 with no outcome",
      },
    });
    await ledger.close();

    const result = await runInterlockEvidence([node.graph, node.id], {
      cwd: dir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.message).not.toContain("professed");
    expect(result.message).not.toContain("cancelled this node");
  });

  it("reads a retained acknowledgment without requiring a debrief or outcome", async () => {
    const { dir } = fixtureRepo();
    const ledger = await openLedger(dir);
    const id = "b".repeat(64);
    ledger.append({ kind: "session-started", session: { id: "crash", node }, brief });
    const request = recordIntent(ledger, node, "crash", id, "SECRET-REQUEST");
    const acknowledgment = recordAcknowledgment(ledger, id, "SECRET-ACKNOWLEDGMENT");
    await ledger.close();

    const result = await runInterlockEvidence([node.graph, node.id, "--delivery"], { cwd: dir });
    expect(result.exitCode).toBe(0);
    expect(result.message).toContain("session: crash");
    expect(result.message).toContain(`id: ${id}`);
    expect(result.message).toContain("state: acknowledged");
    expect(result.message).toContain(request.ref);
    expect(result.message).toContain(acknowledgment.ref);
    expect(result.message).not.toContain("SECRET-REQUEST");
    expect(result.message).not.toContain("SECRET-ACKNOWLEDGMENT");
    expect(result.message).not.toContain("SECRET-TARGET");
    expect(result.message).not.toContain("SECRET-BECAUSE");

    const ordinary = await runInterlockEvidence([node.graph, node.id], { cwd: dir });
    expect(ordinary).toEqual({
      exitCode: 0,
      message: `${node.graph}/${node.id}: no judged session recorded for this node.`,
    });
  });

  it("keeps intent-only and explicitly uncertain effects uncertain and selects the latest session", async () => {
    const { dir } = fixtureRepo();
    const ledger = await openLedger(dir);
    const acknowledged = "c".repeat(64);
    const intentOnly = "d".repeat(64);
    const explicitlyUncertain = "e".repeat(64);
    ledger.append({ kind: "session-started", session: { id: "first", node }, brief });
    recordIntent(ledger, node, "first", acknowledged, "first request");
    recordAcknowledgment(ledger, acknowledged, "first acknowledgment");
    ledger.append({ kind: "session-started", session: { id: "latest", node }, brief });
    recordIntent(ledger, node, "latest", intentOnly, "latest request");
    recordIntent(ledger, node, "latest", explicitlyUncertain, "uncertain request");
    recordIntent(
      ledger,
      { graph: node.graph, id: "other" },
      "latest",
      "0".repeat(64),
      "other node request",
    );
    recordIntent(
      ledger,
      { graph: "other-graph", id: node.id },
      "latest",
      "4".repeat(64),
      "other graph request",
    );
    ledger.append({
      kind: "outbox-delivery-recorded",
      delivery: {
        id: explicitlyUncertain,
        state: "uncertain",
        because: "SECRET-UNCERTAIN-BECAUSE",
        derivation: derivation.gate("outbox", "runner@0", "runner"),
      },
    });
    await ledger.close();

    const latest = await runInterlockEvidence([node.graph, node.id, "--delivery"], { cwd: dir });
    expect(latest.message).toContain("session: latest");
    expect(latest.message).toContain(`id: ${intentOnly}`);
    expect(latest.message).toContain(`id: ${explicitlyUncertain}`);
    expect(latest.message).toContain("state: uncertain");
    expect(latest.message).not.toContain(acknowledged);
    expect(latest.message).not.toContain("0".repeat(64));
    expect(latest.message).not.toContain("4".repeat(64));
    expect(latest.message).not.toContain("SECRET-UNCERTAIN-BECAUSE");

    const first = await runInterlockEvidence(
      [node.graph, node.id, "--delivery", "--session", "first"],
      { cwd: dir },
    );
    expect(first.message).toContain(`id: ${acknowledged}`);
    expect(first.message).toContain("state: acknowledged");
    expect(first.message).not.toContain(intentOnly);
  });

  it("reports retained artifact failures as evidence conditions", async () => {
    const { dir } = fixtureRepo();
    const ledger = await openLedger(dir);
    const missingRequest = "f".repeat(64);
    const corruptRequest = "1".repeat(64);
    const missingAcknowledgment = "2".repeat(64);
    const corruptAcknowledgment = "3".repeat(64);
    ledger.append({ kind: "session-started", session: { id: "artifacts", node }, brief });
    const missingRequestRef = recordIntent(
      ledger,
      node,
      "artifacts",
      missingRequest,
      "missing request",
    );
    const corruptRequestRef = recordIntent(
      ledger,
      node,
      "artifacts",
      corruptRequest,
      "corrupt request",
    );
    recordIntent(
      ledger,
      node,
      "artifacts",
      missingAcknowledgment,
      "missing acknowledgment request",
    );
    const missingAckRef = recordAcknowledgment(
      ledger,
      missingAcknowledgment,
      "missing acknowledgment",
    );
    recordIntent(
      ledger,
      node,
      "artifacts",
      corruptAcknowledgment,
      "corrupt acknowledgment request",
    );
    const corruptAckRef = recordAcknowledgment(
      ledger,
      corruptAcknowledgment,
      "corrupt acknowledgment",
    );
    unlinkSync(join(ledger.directory(), missingRequestRef.ref));
    writeFileSync(join(ledger.directory(), corruptRequestRef.ref), "not an artifact");
    unlinkSync(join(ledger.directory(), missingAckRef.ref));
    writeFileSync(join(ledger.directory(), corruptAckRef.ref), "not an artifact");
    await ledger.close();

    const result = await runInterlockEvidence(
      [node.graph, node.id, "--delivery", "--session", "artifacts"],
      { cwd: dir },
    );
    expect(parse(result.message)).toEqual({
      session: "artifacts",
      effects: [
        { id: missingRequest, evidence: "missing", artifact: missingRequestRef.ref },
        { id: corruptRequest, evidence: "corrupt", artifact: corruptRequestRef.ref },
        { id: missingAcknowledgment, evidence: "missing", artifact: missingAckRef.ref },
        { id: corruptAcknowledgment, evidence: "corrupt", artifact: corruptAckRef.ref },
      ],
    });
  });

  it("reports no recorded effect and rejects delivery option mistakes", async () => {
    const { dir } = fixtureRepo();
    mkdirSync(join(dir, ".interlock"), { recursive: true });
    const noSession = await runInterlockEvidence([node.graph, node.id, "--delivery"], {
      cwd: dir,
    });
    expect(noSession).toEqual({
      exitCode: 0,
      message: `${node.graph}/${node.id}: no session recorded for this node.`,
    });
    const ledger = await openLedger(dir);
    ledger.append({ kind: "session-started", session: { id: "empty", node }, brief });
    await ledger.close();

    const empty = await runInterlockEvidence(
      [node.graph, node.id, "--delivery", "--session", "empty"],
      { cwd: dir },
    );
    expect(empty.exitCode).toBe(0);
    expect(empty.message).toBe("session: empty\nno recorded effect.");

    const absent = await runInterlockEvidence(
      [node.graph, node.id, "--delivery", "--session", "absent"],
      { cwd: dir },
    );
    expect(absent.exitCode).toBe(0);
    expect(absent.message).toContain('no session "absent"');

    for (const args of [
      [node.graph, node.id, "--delivery", "--unknown"],
      [node.graph, node.id, "--delivery", "--session"],
      [node.graph, node.id, "--delivery", "--session", "--delivery"],
      [node.graph, node.id, "--delivery", "--session", "empty", "--session", "other"],
      [node.graph, node.id, "--session", "empty", "--delivery"],
    ]) {
      const invalid = await runInterlockEvidence(args, { cwd: dir });
      expect(invalid.exitCode).toBe(1);
      expect(invalid.message).toContain("expected --delivery [--session S]");
    }
  });
});
