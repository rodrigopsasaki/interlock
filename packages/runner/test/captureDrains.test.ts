import { appendFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { isOk } from "@phyxiusjs/fp";
import { afterEach, describe, expect, it } from "vitest";
import {
  type CaptureStreamDelivery,
  type CaptureStreamHandlers,
  type CaptureTimers,
  type ExecTranscriptLine,
  readExecTranscript,
  readLatestRecord,
  runExecPhase,
  type TranscriptSink,
} from "../src/execRuntime.ts";

type TimerTask = {
  readonly at: number;
  readonly callback: () => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

class ControlledTimers implements CaptureTimers {
  private current = 0;
  private readonly tasks = new Map<ReturnType<typeof setTimeout>, TimerTask>();

  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => undefined, 2_147_000_000);
    this.tasks.set(timer, { at: this.current + delayMs, callback, timer });
    return timer;
  }

  clearTimeout(timer: ReturnType<typeof setTimeout>): void {
    clearTimeout(timer);
    this.tasks.delete(timer);
  }

  nextDue(): number | undefined {
    return [...this.tasks.values()].sort((left, right) => left.at - right.at)[0]?.at;
  }

  advanceNext(): boolean {
    const task = [...this.tasks.values()].sort((left, right) => left.at - right.at)[0];
    if (task === undefined) return false;
    this.tasks.delete(task.timer);
    clearTimeout(task.timer);
    this.current = task.at;
    task.callback();
    return true;
  }
}

class ManualDelivery implements CaptureStreamDelivery {
  readonly processCloseIsNormal = false;
  private handlers: CaptureStreamHandlers | undefined;

  attach(
    _child: Parameters<CaptureStreamDelivery["attach"]>[0],
    handlers: CaptureStreamHandlers,
  ): void {
    this.handlers = handlers;
  }

  ready(): boolean {
    return this.handlers !== undefined;
  }

  data(stream: "stdout" | "stderr", chunk: string): void {
    this.handlersOrThrow().onData(stream, chunk);
  }

  end(stream: "stdout" | "stderr"): void {
    this.handlersOrThrow().onEnd(stream);
  }

  close(stream: "stdout" | "stderr"): void {
    this.handlersOrThrow().onClose(stream);
  }

  private handlersOrThrow(): CaptureStreamHandlers {
    if (this.handlers === undefined) throw new Error("capture stream delivery is not attached");
    return this.handlers;
  }
}

class ControlledSink implements TranscriptSink {
  readonly lines: ExecTranscriptLine[] = [];
  holdStreams = false;
  holdText: string | undefined;
  failNextStream = false;
  private held:
    | {
        readonly path: string;
        readonly line: ExecTranscriptLine;
        readonly resolve: (value: undefined) => void;
      }
    | undefined;

  append(path: string, line: ExecTranscriptLine): Promise<void> {
    if (line.stream !== "runner" && this.failNextStream) {
      this.failNextStream = false;
      return Promise.reject(new Error("held transcript sink failure"));
    }
    if (
      line.stream !== "runner" &&
      this.holdStreams &&
      (this.holdText === undefined || this.holdText === line.text)
    ) {
      return new Promise<undefined>((resolve) => {
        this.held = { path, line, resolve };
      });
    }
    this.write(path, line);
    return Promise.resolve();
  }

  hasHeld(): boolean {
    return this.held !== undefined;
  }

  releaseHeld(): void {
    const held = this.held;
    if (held === undefined) throw new Error("no transcript write is held");
    this.held = undefined;
    this.write(held.path, held.line);
    held.resolve(undefined);
  }

  private write(path: string, line: ExecTranscriptLine): void {
    this.lines.push(line);
    appendFileSync(path, `${JSON.stringify(line)}\n`, "utf8");
  }
}

const runsRoot = join(import.meta.dirname, ".runs");
mkdirSync(runsRoot, { recursive: true });
let directory: string | undefined;

afterEach(() => {
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function fixtureRoot(): string {
  directory = mkdtempSync(join(runsRoot, "capture-drains-"));
  return directory;
}

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition did not become true");
}

async function advanceCaptureTimer(timers: ControlledTimers): Promise<boolean> {
  for (let attempt = 0; attempt < 100_000; attempt += 1) {
    if (timers.advanceNext()) {
      await Promise.resolve();
      await Promise.resolve();
      return true;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return false;
}

async function manualRun(
  root: string,
  sink: ControlledSink,
  delivery: ManualDelivery,
  timers: ControlledTimers,
): Promise<{ readonly pending: ReturnType<typeof runExecPhase> }> {
  const pending = runExecPhase({
    runRoot: join(root, "interlock", "runs"),
    id: "capture",
    phase: "work",
    graph: "g",
    node: "n",
    runtime: "fixture",
    model: "fixture-model",
    program: process.execPath,
    args: ["-e", "process.exit(0)"],
    prompt: "unused",
    cwd: root,
    timeoutMs: 2_000,
    termGraceMs: 10,
    drainGraceMs: 10,
    captureSettleMs: 10,
    transcriptSink: sink,
    captureTimers: timers,
    captureStreamDelivery: delivery,
  });
  await waitFor(() => delivery.ready());
  return { pending };
}

async function terminalResult(
  pending: ReturnType<typeof runExecPhase>,
  timers: ControlledTimers,
): Promise<Awaited<ReturnType<typeof runExecPhase>>> {
  const advanced = await advanceCaptureTimer(timers);
  if (advanced && timers.nextDue() !== undefined) await advanceCaptureTimer(timers);
  return pending;
}

describe("capture drains", () => {
  it("tail held on an ended stream", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    sink.holdText = "tail";
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "tail");
    delivery.end("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    sink.holdStreams = false;
    sink.releaseHeld();
    const result = await pending;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(true);
    expect(
      (await readExecTranscript(result.value.runDir)).some((line) => line.text === "tail"),
    ).toBe(true);
  });

  it("tail held on one stream", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    sink.holdText = "stderr-tail";
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "stdout-line\n");
    delivery.end("stdout");
    delivery.data("stderr", "stderr-tail");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    sink.holdStreams = false;
    sink.releaseHeld();
    const result = await pending;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(true);
  });

  it("held line with no tail", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "held-line\n");
    delivery.end("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    sink.holdStreams = false;
    sink.releaseHeld();
    const result = await pending;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(true);
  });

  it("alternating streams in ready order", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    sink.holdText = "stdout-first";
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "stdout-first\n");
    delivery.data("stderr", "stderr-second\n");
    delivery.end("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    sink.holdStreams = false;
    sink.releaseHeld();
    const result = await pending;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    const lines = (await readExecTranscript(result.value.runDir)).filter(
      (line) => line.stream !== "runner",
    );
    expect(lines.map((line) => line.text)).toEqual(["stdout-first", "stderr-second"]);
  });

  it("held write outlasts the grace", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "late-line\n");
    delivery.end("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    const resultPromise = terminalResult(pending, timers);
    const result = await resultPromise;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(false);
    sink.holdStreams = false;
    sink.releaseHeld();
    await waitFor(() => sink.lines.some((line) => line.text.includes("ended ")));
    const closingIndex = sink.lines.findIndex((line) => line.text.includes("ended "));
    expect(sink.lines.slice(closingIndex + 1).some((line) => line.stream !== "runner")).toBe(false);
  });

  it("stuck writer still ends", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.holdStreams = true;
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "never-written\n");
    delivery.end("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.hasHeld());
    const result = await terminalResult(pending, timers);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(false);
  });

  it("failed chunk then tail", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    sink.failNextStream = true;
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.data("stdout", "failed\n");
    delivery.data("stdout", "tail");
    delivery.end("stdout");
    delivery.end("stderr");
    const result = await pending;
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(false);
    expect((await readExecTranscript(result.value.runDir)).map((line) => line.text)).toContain(
      "tail",
    );
  });

  it("destroyed stream is not an end", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    const delivery = new ManualDelivery();
    const timers = new ControlledTimers();
    const { pending } = await manualRun(root, sink, delivery, timers);
    delivery.close("stdout");
    delivery.end("stderr");
    await waitFor(() => sink.lines.some((line) => line.text === "ending group anchor"));
    const result = await terminalResult(pending, timers);
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(false);
  });

  it("early failure drains the launcher", async () => {
    const root = fixtureRoot();
    const sink = new ControlledSink();
    const runRoot = join(root, "interlock", "runs");
    const result = await runExecPhase({
      runRoot,
      id: "capture",
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [],
      launcherPath: join(import.meta.dirname, "fixtures", "exec", "earlyFailLauncher.mjs"),
      prompt: "unused",
      cwd: root,
      timeoutMs: 2_000,
      drainGraceMs: 100,
      captureSettleMs: 100,
      transcriptSink: sink,
    });
    expect(isOk(result)).toBe(false);
    const run = readLatestRecord(join(runRoot, "capture", "work"));
    expect(run?.captureComplete).toBe(true);
    expect(sink.lines.some((line) => line.text === "launcher diagnostic")).toBe(true);
  });

  it("many lines from a real program", async () => {
    const root = fixtureRoot();
    const result = await runExecPhase({
      runRoot: join(root, "interlock", "runs"),
      phase: "work",
      graph: "g",
      node: "n",
      runtime: "fixture",
      model: "fixture-model",
      program: process.execPath,
      args: [join(import.meta.dirname, "fixtures", "exec", "manyLines.mjs")],
      prompt: "unused",
      cwd: root,
      timeoutMs: 2_000,
      drainGraceMs: 5_000,
    });
    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.record.captureComplete).toBe(true);
    const lines = await readExecTranscript(result.value.runDir);
    expect(lines.filter((line) => line.stream === "stdout")).toHaveLength(25);
    expect(lines.filter((line) => line.stream === "stderr")).toHaveLength(25);
    expect(existsSync(result.value.record.transcriptPath)).toBe(true);
  });
});
