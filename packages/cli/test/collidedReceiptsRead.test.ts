import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { unwrap } from "@phyxiusjs/fp";
import { renderGraphFrame, sharedJournalDirectory } from "face";
import { createLedger, derivation, duration, gate, sessionRuntime, spend } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import { runGraphShow } from "../src/graph/show.ts";
import { runInterlockPosition } from "../src/position.ts";
import { runSessionShow } from "../src/session/show.ts";
import { gitInitFixture } from "./graph/gitFixture.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });

let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function receipt(
  id: string,
  gateId: string,
  proof: Readonly<Record<string, unknown>>,
  receiptDerivation = derivation.gate(gateId, "runner@0", "runner"),
) {
  return {
    id,
    gate: gateId,
    commitSha: "deadbeef",
    spend: spend.none(),
    duration: duration.unknown(),
    derivation: receiptDerivation,
    proof,
  };
}

async function fixture(): Promise<string> {
  directory = mkdtempSync(join(runsRoot, "collided-receipts-"));
  gitInitFixture(directory);
  mkdirSync(join(directory, ".interlock", "graphs"), { recursive: true });
  writeFileSync(
    join(directory, ".interlock", "graphs", "demo.yaml"),
    [
      "interlock: graph@v0",
      "id: demo",
      "nodes:",
      "  - id: n1",
      "    depends_on: []",
      "    gates:",
      "      - id: proof",
      "        kind: command",
      "      - id: pattern",
      "        kind: command",
      "      - id: human",
      "        kind: human",
      "      - id: legacy",
      "        kind: command",
      "",
    ].join("\n"),
  );

  const ledger = unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: await sharedJournalDirectory(directory),
    }),
  );
  const node = { graph: "demo", id: "n1" };
  const failing = receipt("same-id", "proof", { exitCode: 1, outputHash: "fail" });
  const outputMismatch = receipt("pattern-id", "pattern", {
    exitCode: 0,
    outputHash: "output",
    outputMatched: false,
    pattern: "Tests +[1-9][0-9]* passed",
  });
  const human = receipt(
    "human-id",
    "human",
    { because: "Rodrigo cleared this" },
    derivation.human("Rodrigo Sasaki"),
  );
  const legacy = receipt("legacy-id", "legacy", {});
  ledger.append({
    kind: "session-started",
    session: { id: "s1", node, runtime: sessionRuntime.unknown() },
    brief: {
      graph: "demo",
      node: "n1",
      role: "worker",
      acceptance: "the recorded proof is read honestly",
      gates: ["proof", "pattern", "human", "legacy"],
      scope: [],
    },
  });
  ledger.append({ kind: "receipt-written", node, receipt: failing });
  ledger.append({
    kind: "gate-moved",
    node,
    gate: "proof",
    to: gate.blocked("exit 1", "proof failed"),
  });
  ledger.append({ kind: "gate-moved", node, gate: "proof", to: gate.satisfied(failing) });
  ledger.append({ kind: "receipt-written", node, receipt: outputMismatch });
  ledger.append({ kind: "gate-moved", node, gate: "pattern", to: gate.satisfied(outputMismatch) });
  ledger.append({ kind: "receipt-written", node, receipt: human });
  ledger.append({ kind: "gate-moved", node, gate: "human", to: gate.satisfied(human) });
  ledger.append({ kind: "receipt-written", node, receipt: legacy });
  ledger.append({ kind: "gate-moved", node, gate: "legacy", to: gate.satisfied(legacy) });
  await ledger.close();
  return directory;
}

describe("collided receipt reads", () => {
  it("names both mismatches in position, graph, session and face reads", async () => {
    const cwd = await fixture();
    const graphText = await runGraphShow(["demo"], { cwd });
    expect(graphText.exitCode).toBe(0);
    expect(graphText.message).toContain(
      "proof blocked (recorded proof does not meet its criterion: exit 1)",
    );
    expect(graphText.message).toContain(
      "pattern blocked (recorded proof does not meet its criterion: output did not match",
    );

    const graphJson = await runGraphShow(["demo", "--json"], { cwd });
    const parsed = JSON.parse(graphJson.message);
    expect(parsed.nodes[0].gates[0].state.because).toContain("exit 1");
    expect(parsed.nodes[0].gates[1].state.because).toContain("output did not match");

    const position = await runInterlockPosition(["--repo", cwd], { cwd });
    expect(position.message).toContain(
      "proof blocked (recorded proof does not meet its criterion: exit 1)",
    );
    expect(position.message).toContain(
      "pattern blocked (recorded proof does not meet its criterion: output did not match",
    );

    const session = await runSessionShow(["demo", "n1"], { cwd });
    expect(session.message).toContain("proof: recorded proof does not meet its criterion: exit 1");
    expect(session.message).toContain(
      "pattern: recorded proof does not meet its criterion: output did not match",
    );

    expect(renderGraphFrame(parsed, 0)).toContain(
      "proof blocked (recorded proof does not meet its criterion: exit 1)",
    );
    expect(renderGraphFrame(parsed, 0)).toContain(
      "pattern blocked (recorded proof does not meet its criterion: output did not match",
    );
    expect(session.message).toContain("legacy: satisfied");
    expect(session.message).toContain("human: satisfied");
  });
});
