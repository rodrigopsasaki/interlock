import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createControlledClock } from "@phyxiusjs/clock";
import { isOk, unwrap } from "@phyxiusjs/fp";
import { createLedger, sessionRuntime } from "ledger";
import { afterEach, describe, expect, it } from "vitest";
import {
  dispatchExecStopIntent,
  type ExecStopTarget,
  readLatestRecord,
  recordExecStopIntent,
  replayExecStopIntents,
  runExecPhase,
  stopExecSession,
} from "../src/index.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "exec-stop-"));
  return directory;
}

async function openLedger(root: string) {
  return unwrap(
    await createLedger({
      clock: createControlledClock({ initialTime: 0 }),
      directory: join(root, "journal"),
    }),
  );
}

async function waitForRunning(runDir: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const record = readLatestRecord(runDir);
    if (
      record?.state === "running" &&
      record.controlSocketPath !== undefined &&
      existsSync(join(runDir, "anchor.json"))
    )
      return record;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("exec phase did not publish a running record");
}

function seedSession(ledger: Awaited<ReturnType<typeof openLedger>>, id: string): void {
  ledger.append({
    kind: "session-started",
    session: { id, node: { graph: "g", id: "n" }, runtime: sessionRuntime.unknown() },
    brief: { graph: "g", node: "n", role: "implementer", acceptance: "stop", gates: [], scope: [] },
  });
  ledger.append({
    kind: "lease-taken",
    node: { graph: "g", id: "n" },
    session: id,
    expiry: 60_000,
  });
}

function request(root: string, ledger: Awaited<ReturnType<typeof openLedger>>, id: string) {
  return {
    runRoot: join(root, "runs"),
    id,
    phase: "work" as const,
    graph: "g",
    node: "n",
    runtime: "fixture",
    model: "fixture",
    program: process.execPath,
    args: [join(import.meta.dirname, "fixtures", "exec", "ignoreTerm.mjs")],
    prompt: "unused",
    cwd: root,
    timeoutMs: 10_000,
    termGraceMs: 50,
    drainGraceMs: 200,
    ledger,
  };
}

describe("exec stop", () => {
  it("records and dispatches a phase stop through the outbox", async () => {
    const root = fixtureRoot();
    const ledger = await openLedger(root);
    seedSession(ledger, "session-1");
    const running = runExecPhase(request(root, ledger, "session-1"));
    const record = await waitForRunning(join(root, "runs", "session-1", "work"));
    const target: ExecStopTarget = {
      graph: record.graph,
      node: record.node,
      session: record.id,
      phaseId: record.phaseId,
      controlSocketPath: record.controlSocketPath,
      controlSecret: record.controlSecret,
    };
    const stopped = await stopExecSession(
      ledger,
      target,
      "Rodrigo",
      "memory pressure",
      "phase",
      10,
    );
    expect(isOk(stopped)).toBe(true);
    const result = await running;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.state).toBe("killed");
    expect(result.value.record.reason).toBe("stopped by Rodrigo");
    const effect = [...ledger.projection().outbox.values()].find(
      (view) => view.intent.target === "exec-stop",
    );
    expect(effect?.delivery?.state).toBe("acknowledged");
  }, 15_000);

  it("replays an uncertain stop intent and records the later delivery", async () => {
    const root = fixtureRoot();
    const ledger = await openLedger(root);
    seedSession(ledger, "session-2");
    const running = runExecPhase(request(root, ledger, "session-2"));
    const record = await waitForRunning(join(root, "runs", "session-2", "work"));
    const target: ExecStopTarget = {
      graph: record.graph,
      node: record.node,
      session: record.id,
      phaseId: record.phaseId,
      controlSocketPath: record.controlSocketPath,
      controlSecret: record.controlSecret,
    };
    const intent = recordExecStopIntent(ledger, target, "Rodrigo", "replay", "phase");
    expect(isOk(intent)).toBe(true);
    if (!isOk(intent)) return;
    const uncertain = await dispatchExecStopIntent(
      ledger,
      { ...target, controlSocketPath: join(root, "missing.sock") },
      intent.value,
      10,
    );
    expect(isOk(uncertain)).toBe(false);
    const replayed = await replayExecStopIntents(ledger, [target], 10);
    expect(replayed).toEqual([intent.value]);
    const result = await running;
    expect(isOk(result)).toBe(true);
    expect(ledger.projection().outbox.get(intent.value)?.delivery?.state).toBe("acknowledged");
  }, 15_000);
});
