import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type ProgramExitObservation,
  type ProgramExitScheduler,
  type ProgramExitWatcher,
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
  directory = mkdtempSync(join(runsRoot, "start-failure-"));
  return join(directory, "exit.json");
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
});
