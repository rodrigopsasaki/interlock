import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ProgramExit,
  type ProgramExitObservation,
  type ProgramExitScheduler,
  type ProgramExitWatcher,
  runExecPhase,
  waitForProgramExit,
} from "../src/execRuntime.ts";

type ScheduledTask = {
  readonly at: number;
  readonly callback: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

class ControlledScheduler implements ProgramExitScheduler {
  private current = 0;
  private readonly tasks = new Map<ReturnType<typeof setTimeout>, ScheduledTask>();

  now(): number {
    return this.current;
  }

  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => undefined, 2_147_000_000);
    this.tasks.set(timer, { at: this.current + delayMs, callback, timer });
    return timer;
  }

  clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
    this.tasks.delete(timer);
  }

  advanceTo(at: number): void {
    while (true) {
      const next = [...this.tasks.values()]
        .filter((task) => task.at <= at)
        .sort((left, right) => left.at - right.at)[0];
      if (next === undefined) break;
      this.tasks.delete(next.timer);
      this.current = next.at;
      next.callback();
    }
    this.current = at;
  }

  nextDue(): number | undefined {
    return [...this.tasks.values()].sort((left, right) => left.at - right.at)[0]?.at;
  }
}

class ControlledWatcher implements ProgramExitWatcher {
  private errorListener: (() => void) | undefined;
  private eventListener:
    | ((eventType: string, filename: string | Buffer | null) => void)
    | undefined;
  closed = false;

  on(_event: "error", listener: () => void): ProgramExitWatcher {
    this.errorListener = listener;
    return this;
  }

  attach(listener: (eventType: string, filename: string | Buffer | null) => void): void {
    this.eventListener = listener;
  }

  close(): void {
    this.closed = true;
  }

  emitError(): void {
    this.errorListener?.();
  }

  emit(eventType: string, filename: string | Buffer | null): void {
    this.eventListener?.(eventType, filename);
  }
}

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function exitPath(): string {
  return join(fixtureRoot(), "exit.json");
}

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "start-failure-"));
  return directory;
}

function observation(
  scheduler: ControlledScheduler,
  watcher: ControlledWatcher | (() => never),
): ProgramExitObservation {
  return {
    scheduler,
    pollMs: 10,
    watch: (_path, listener) => {
      if (typeof watcher === "function") return watcher();
      watcher.attach(listener);
      return watcher;
    },
  };
}

async function waitForTask(scheduler: ControlledScheduler): Promise<number> {
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    const next = scheduler.nextDue();
    if (next !== undefined) return next;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("controlled scheduler did not receive a task");
}

async function waitForPath(path: string): Promise<void> {
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    if (existsSync(path)) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error(`path did not appear: ${path}`);
}

type ControlledRun = {
  readonly pending: ReturnType<typeof runExecPhase>;
  readonly scheduler: ControlledScheduler;
  readonly evidence: { value: ProgramExit | undefined };
  readonly runRoot: string;
};

function controlledRun(root: string, program: string, args: readonly string[]): ControlledRun {
  const scheduler = new ControlledScheduler();
  const evidence: { value: ProgramExit | undefined } = { value: undefined };
  const watcher = new ControlledWatcher();
  const runRoot = join(root, "interlock", "runs");
  const observation: ProgramExitObservation = {
    read: () => evidence.value,
    scheduler,
    pollMs: 10,
    watch: (_path, listener) => {
      watcher.attach(listener);
      return watcher;
    },
  };
  const pending = runExecPhase({
    runRoot,
    id: "controlled",
    phase: "work",
    graph: "g",
    node: "n",
    runtime: "fixture",
    model: "fixture-model",
    program,
    args,
    prompt: "unused",
    cwd: root,
    timeoutMs: 40,
    termGraceMs: 40,
    drainGraceMs: 40,
    programExitObservation: observation,
  });
  return { pending, scheduler, evidence, runRoot };
}

function expectTimeoutStartFailure(result: Awaited<ControlledRun["pending"]>, code: string): void {
  expect(result).toMatchObject({
    value: { record: { state: "failed", reason: `program could not start: ${code}` } },
  });
}

describe("program exit observation", () => {
  it("polls exit.json when the watcher drops every event", async () => {
    const path = exitPath();
    const scheduler = new ControlledScheduler();
    const watcher = new ControlledWatcher();
    const pending = waitForProgramExit(path, 100, observation(scheduler, watcher));

    writeFileSync(path, JSON.stringify({ interlock: "exit@v0", error: "ENOENT" }));
    watcher.emit("rename", "exit.json.tmp");
    scheduler.advanceTo(10);

    await expect(pending).resolves.toEqual({ code: null, signal: null, error: "ENOENT" });
    expect(watcher.closed).toBe(true);
  });

  it("keeps polling after watcher creation throws", async () => {
    const path = exitPath();
    const scheduler = new ControlledScheduler();
    const pending = waitForProgramExit(
      path,
      100,
      observation(scheduler, () => {
        throw new Error("watch unavailable");
      }),
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    scheduler.advanceTo(20);
    await Promise.resolve();
    expect(settled).toBe(false);
    writeFileSync(path, JSON.stringify({ interlock: "exit@v0", error: "ENOENT" }));
    scheduler.advanceTo(30);

    await expect(pending).resolves.toEqual({ code: null, signal: null, error: "ENOENT" });
  });

  it("keeps polling after the watcher emits an error", async () => {
    const path = exitPath();
    const scheduler = new ControlledScheduler();
    const watcher = new ControlledWatcher();
    const pending = waitForProgramExit(path, 100, observation(scheduler, watcher));
    watcher.emitError();
    scheduler.advanceTo(20);
    writeFileSync(path, JSON.stringify({ interlock: "exit@v0", error: "ENOENT" }));
    scheduler.advanceTo(30);

    await expect(pending).resolves.toEqual({ code: null, signal: null, error: "ENOENT" });
  });

  it("performs a final read at the deadline", async () => {
    const path = exitPath();
    const scheduler = new ControlledScheduler();
    const watcher = new ControlledWatcher();
    const pending = waitForProgramExit(path, 100, observation(scheduler, watcher));

    scheduler.advanceTo(99);
    writeFileSync(path, JSON.stringify({ interlock: "exit@v0", error: "ENOENT" }));
    scheduler.advanceTo(100);

    await expect(pending).resolves.toEqual({ code: null, signal: null, error: "ENOENT" });
    expect(existsSync(path)).toBe(true);
  });

  it("reconciles a spawn error written after the deadline before TERM", async () => {
    const root = fixtureRoot();
    const run = controlledRun(root, join(root, "missing-program"), []);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(40);
    run.evidence.value = { code: null, signal: null, error: "ENOENT" };

    const result = await run.pending;
    expectTimeoutStartFailure(result, "ENOENT");
  });

  it("reconciles a spawn error written during TERM grace", async () => {
    const root = fixtureRoot();
    const run = controlledRun(root, join(root, "missing-program"), []);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(40);
    await waitForTask(run.scheduler);
    run.evidence.value = { code: null, signal: null, error: "ENOENT" };
    run.scheduler.advanceTo(80);

    const result = await run.pending;
    expectTimeoutStartFailure(result, "ENOENT");
  });

  it("reconciles a spawn error written during the later bounded exit wait", async () => {
    const root = fixtureRoot();
    const run = controlledRun(root, join(root, "missing-program"), []);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(40);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(80);
    await waitForTask(run.scheduler);
    run.evidence.value = { code: null, signal: null, error: "ENOENT" };
    run.scheduler.advanceTo(120);

    const result = await run.pending;
    expectTimeoutStartFailure(result, "ENOENT");
  });

  it("keeps a successful nonzero spawn as a run timeout after the deadline", async () => {
    const root = fixtureRoot();
    const marker = join(root, "exit-marker");
    const program = join(import.meta.dirname, "fixtures", "exec", "waitForMarker.mjs");
    const run = controlledRun(root, process.execPath, [program, marker, "7"]);
    await waitForTask(run.scheduler);
    await waitForPath(join(run.runRoot, "controlled", "work", "handoff.json"));
    run.scheduler.advanceTo(40);
    run.evidence.value = { code: 7, signal: null };
    writeFileSync(marker, "exit\n");

    const result = await run.pending;
    expect(result).toMatchObject({
      value: { record: { state: "killed", reason: "run timeout 40ms" } },
    });
    if ("value" in result) expect(existsSync(join(result.value.runDir, "handoff.json"))).toBe(true);
  });

  it("kills a program that runs past the deadline", async () => {
    const root = fixtureRoot();
    const marker = join(root, "never-created");
    const program = join(import.meta.dirname, "fixtures", "exec", "waitForMarker.mjs");
    const run = controlledRun(root, process.execPath, [program, marker, "0"]);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(40);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(80);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(120);
    await waitForTask(run.scheduler);
    run.scheduler.advanceTo(160);

    const result = await run.pending;
    expect(result).toMatchObject({
      value: { record: { state: "killed", reason: "run timeout 40ms" } },
    });
    if ("value" in result) expect(existsSync(join(result.value.runDir, "handoff.json"))).toBe(true);
  }, 15_000);
});
