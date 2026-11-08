import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { err, isOk, ok } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ExecPhaseKind,
  listExecSessions,
  readExecTranscript,
  readLatestRecord,
  runExecPhase,
} from "../src/execRuntime.ts";

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "exec-runtime-"));
  return directory;
}

describe("runExecPhase", () => {
  it("records a completed child and normalizes both streams", async () => {
    const root = fixtureRoot();
    const runRoot = join(root, "interlock", "runs");
    const result = await runExecPhase({
      runRoot,
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "writeStreams.mjs")],
      prompt: "unused",
      cwd: root,
      timeoutMs: 2_000,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.state).toBe("done");
    expect(result.value.record.captureComplete).toBe(true);
    const lines = await readExecTranscript(result.value.runDir);
    expect(lines.filter((line) => line.stream === "stdout").map((line) => line.text)).toEqual([
      "out-one",
      "out-two-partial",
    ]);
    expect(lines.filter((line) => line.stream === "stderr").map((line) => line.text)).toEqual([
      "err-one",
    ]);
    expect(lines.every((line) => line.interlock === "transcript@v0")).toBe(true);
    expect(readLatestRecord(result.value.runDir)?.state).toBe("done");
    expect((await listExecSessions(runRoot)).map((record) => record.id)).toEqual([
      result.value.record.id,
    ]);
    expect(existsSync(join(result.value.runDir, "started.json"))).toBe(true);
    expect(existsSync(join(result.value.runDir, "handoff.json"))).toBe(true);
  });

  it("refuses before spawning when admission is refused", async () => {
    const root = fixtureRoot();
    const result = await runExecPhase({
      runRoot: join(root, "interlock", "runs"),
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "writeStreams.mjs")],
      prompt: "unused",
      cwd: root,
      timeoutMs: 100,
      admission: {
        admit: async () => err("machine limit"),
        bind: async () => ok(undefined),
        release: async () => ok(undefined),
      },
    });

    expect(isOk(result)).toBe(false);
  });

  it("reaps a grandchild after the program exits", async () => {
    const root = fixtureRoot();
    const result = await runExecPhase({
      runRoot: join(root, "interlock", "runs"),
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "reapGrandchild.mjs")],
      prompt: "unused",
      cwd: root,
      timeoutMs: 2_000,
      termGraceMs: 100,
      drainGraceMs: 100,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.state).toBe("done");
    expect(result.value.record.reaped).toBe(1);
  });

  it("kills a TERM-ignoring group after the run timeout", async () => {
    const root = fixtureRoot();
    const result = await runExecPhase({
      runRoot: join(root, "interlock", "runs"),
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "ignoreTerm.mjs")],
      prompt: "unused",
      cwd: root,
      timeoutMs: 100,
      termGraceMs: 100,
      drainGraceMs: 500,
    });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.state).toBe("killed");
    expect(result.value.record.reason).toBe("run timeout 100ms");
  }, 15_000);

  it("distinguishes launcher, node, and profile-program start failures", async () => {
    const root = fixtureRoot();
    const phase: ExecPhaseKind = "work";
    const base = {
      runRoot: join(root, "interlock", "runs"),
      phase,
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      prompt: "unused",
      cwd: root,
      timeoutMs: 2_000,
      termGraceMs: 100,
      drainGraceMs: 100,
    };
    const missingNode = await runExecPhase({
      ...base,
      nodeExecutable: join(root, "missing-node"),
      program: process.execPath,
      args: [],
    });
    const missingLauncher = await runExecPhase({
      ...base,
      phaseId: "missing-launcher",
      launcherPath: join(root, "missing-launcher"),
      program: process.execPath,
      args: [],
    });
    const missingProgram = await runExecPhase({
      ...base,
      phaseId: "missing-program",
      program: join(root, "missing-program"),
      args: [],
    });

    expect(isOk(missingNode)).toBe(false);
    expect(isOk(missingLauncher)).toBe(false);
    expect(isOk(missingProgram)).toBe(true);
    if (isOk(missingNode) || isOk(missingLauncher) || !isOk(missingProgram)) return;
    expect(missingProgram.value.record.reason).toBe("program could not start: ENOENT");
    expect(existsSync(join(missingProgram.value.runDir, "handoff.json"))).toBe(false);
  });
});
