import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { type OwnedProcess, spawnOwned } from "./ownedCommand.ts";

export const SESSION_SHAPE = "session@v0";
export const TRANSCRIPT_SHAPE = "transcript@v0";
export const DEFAULT_DRAIN_GRACE_MS = 5_000;
export const DEFAULT_CAPTURE_SETTLE_MS = 5_000;
export const DEFAULT_TERM_GRACE_MS = 1_000;

export type ExecPhaseKind = "work" | "debrief" | "review";
export type ExecPhaseState = "running" | "done" | "failed" | "killed";

export interface ExecSessionAsk {
  readonly id: string;
  readonly at: string;
  readonly asked: string;
  readonly options: readonly string[] | null;
  readonly answered: { readonly at: string; readonly by: string; readonly words: string } | null;
}

export interface ExecSessionRecord {
  readonly interlock: typeof SESSION_SHAPE;
  readonly id: string;
  readonly phase: ExecPhaseKind;
  readonly phaseId: string;
  readonly parentId: string | null;
  readonly kind: "node" | "review";
  readonly graph: string;
  readonly node: string | null;
  readonly lens: string | null;
  readonly subjectHash: string | null;
  readonly snapshotHash: string | null;
  readonly arc: string | null;
  readonly runtime: string;
  readonly model: string;
  readonly pid: number | null;
  readonly pgid: number | null;
  readonly runnerPid: number;
  readonly runnerBirth: string;
  readonly runnerBoot: string;
  readonly launchNonce: string;
  readonly controlSecret: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly state: ExecPhaseState;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string | null;
  readonly reaped: number;
  readonly captureComplete: boolean;
  readonly asks: readonly ExecSessionAsk[];
  readonly waitingOnAsk: boolean;
  readonly transcriptPath: string;
  readonly sampledMembers: readonly number[];
  readonly goIntent: boolean;
}

export interface ExecTranscriptLine {
  readonly interlock: typeof TRANSCRIPT_SHAPE;
  readonly ts: string;
  readonly stream: "stdout" | "stderr" | "runner";
  readonly text: string;
}

export interface ExecSessionView {
  readonly interlock: "sessions@v0";
  readonly id: string;
  readonly phase: ExecPhaseKind;
  readonly phaseId: string;
  readonly parentId: string | null;
  readonly kind: "node" | "review";
  readonly graph: string;
  readonly node: string | null;
  readonly lens: string | null;
  readonly subjectHash: string | null;
  readonly snapshotHash: string | null;
  readonly arc: string | null;
  readonly runtime: string;
  readonly model: string;
  readonly pid: number | null;
  readonly pgid: number | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly state: ExecPhaseState;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string | null;
  readonly reaped: number;
  readonly captureComplete: boolean;
  readonly asks: readonly ExecSessionAsk[];
  readonly waitingOnAsk: boolean;
  readonly transcriptPath: string;
}

export interface ExecAdmission {
  admit(): Promise<Result<void, string>>;
  bind(identity: {
    readonly pid: number;
    readonly pgid: number;
    readonly birth: string;
    readonly boot: string;
  }): Promise<Result<void, string>>;
  release(
    outcome: "never-started" | "group-empty" | "override",
    pgid: string,
  ): Promise<Result<void, string>>;
}

export interface ProgramExitWatcher {
  on(event: "error", listener: () => void): ProgramExitWatcher;
  close(): void;
}

export interface ProgramExitScheduler {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface ProgramExitObservation {
  readonly read?: (path: string) => ProgramExit | undefined;
  readonly watch?: (
    path: string,
    listener: (eventType: string, filename: string | Buffer | null) => void,
  ) => ProgramExitWatcher;
  readonly scheduler?: ProgramExitScheduler;
  readonly pollMs?: number;
}

export interface TranscriptSink {
  append(path: string, line: ExecTranscriptLine): Promise<void>;
}

export interface CaptureTimers {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
}

export interface CaptureStreamHandlers {
  onData(stream: "stdout" | "stderr", chunk: string): void;
  onEnd(stream: "stdout" | "stderr"): void;
  onClose(stream: "stdout" | "stderr"): void;
}

export interface CaptureStreamDelivery {
  readonly processCloseIsNormal?: boolean;
  attach(child: OwnedProcess, handlers: CaptureStreamHandlers): void;
}

export interface ExecPhaseRequest {
  readonly runRoot: string;
  readonly id?: string;
  readonly phase: ExecPhaseKind;
  readonly phaseId?: string;
  readonly parentId?: string | null;
  readonly kind?: "node" | "review";
  readonly graph: string;
  readonly node?: string | null;
  readonly lens?: string | null;
  readonly subjectHash?: string | null;
  readonly snapshotHash?: string | null;
  readonly arc?: string | null;
  readonly runtime: string;
  readonly model: string;
  readonly program: string;
  readonly args: readonly string[];
  readonly prompt: string;
  readonly promptOnStdin?: boolean;
  readonly cwd: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly timeoutMs: number;
  readonly termGraceMs?: number;
  readonly drainGraceMs?: number;
  readonly captureSettleMs?: number;
  readonly transcriptSink?: TranscriptSink;
  readonly captureTimers?: CaptureTimers;
  readonly captureStreamDelivery?: CaptureStreamDelivery;
  readonly admission?: ExecAdmission;
  readonly nodeExecutable?: string;
  readonly launcherPath?: string;
  readonly programExitObservation?: ProgramExitObservation;
}

export interface ExecPhaseOutcome {
  readonly record: ExecSessionRecord;
  readonly runDir: string;
}

export type ExecRuntimeRefusal =
  | { readonly kind: "machine"; readonly because: string }
  | { readonly kind: "launch"; readonly because: string }
  | { readonly kind: "lost-anchor"; readonly because: string }
  | { readonly kind: "record"; readonly because: string };

function now(): string {
  return new Date().toISOString();
}

function idHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function publishRecord(runDir: string, record: ExecSessionRecord): Promise<void> {
  const recordDir = join(runDir, "record");
  await mkdir(recordDir, { recursive: true, mode: 0o700 });
  const generations = readdirSync(recordDir)
    .map((name) => Number(name.replace(/\.json$/, "")))
    .filter((value) => Number.isInteger(value));
  const generation = (generations.length === 0 ? -1 : Math.max(...generations)) + 1;
  const path = join(recordDir, `${generation}.json`);
  try {
    const handle = await open(path, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(record)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      const latest = readLatestRecord(runDir);
      if (latest !== undefined && latest.state !== "running") return;
      return publishRecord(runDir, record);
    }
    throw error;
  }
}

export function readLatestRecord(runDir: string): ExecSessionRecord | undefined {
  const recordDir = join(runDir, "record");
  if (!existsSync(recordDir)) return undefined;
  const paths = readdirSync(recordDir)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => Number(a.slice(0, -5)) - Number(b.slice(0, -5)));
  const latest = paths.at(-1);
  if (latest === undefined) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(join(recordDir, latest), "utf8"));
  return isSessionRecord(parsed) ? parsed : undefined;
}

function isSessionRecord(value: unknown): value is ExecSessionRecord {
  if (typeof value !== "object" || value === null) return false;
  if (!("interlock" in value) || value.interlock !== SESSION_SHAPE) return false;
  if (!("state" in value)) return false;
  return (
    value.state === "running" ||
    value.state === "done" ||
    value.state === "failed" ||
    value.state === "killed"
  );
}

async function appendTranscript(path: string, line: ExecTranscriptLine): Promise<void> {
  const handle = await open(path, "a", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(line)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

const nativeTranscriptSink: TranscriptSink = {
  append: appendTranscript,
};

const nativeCaptureTimers: CaptureTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

type PendingTranscriptWrite = {
  readonly line: ExecTranscriptLine;
  readonly resolve: (written: boolean) => void;
};

class TranscriptWriter {
  private readonly queue: PendingTranscriptWrite[] = [];
  private readonly idleWaiters: Array<() => void> = [];
  private running = false;
  private sealed = false;
  private failedBecause: string | undefined;

  constructor(
    private readonly path: string,
    private readonly sink: TranscriptSink,
  ) {}

  append(line: ExecTranscriptLine): Promise<boolean> {
    if (this.sealed && line.stream !== "runner") return Promise.resolve(false);
    return new Promise((resolve) => {
      this.queue.push({ line, resolve });
      void this.pump();
    });
  }

  seal(): void {
    this.sealed = true;
  }

  isSealed(): boolean {
    return this.sealed;
  }

  failure(): string | undefined {
    return this.failedBecause;
  }

  waitForIdle(): Promise<void> {
    if (!this.running && this.queue.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0) {
      const pending = this.queue.shift();
      if (pending === undefined) continue;
      try {
        await this.sink.append(this.path, pending.line);
        pending.resolve(true);
      } catch (error) {
        const because = error instanceof Error ? error.message : String(error);
        this.failedBecause ??= because;
        process.stderr.write(`transcript write failed: ${because}\n`);
        pending.resolve(false);
      }
    }
    this.running = false;
    const waiters = this.idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}

function groupAlive(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && "code" in error && error.code === "ESRCH");
  }
}

function connectControl(
  socketPath: string,
  secret: string,
  action: "TERM" | "KILL" | "end" | "members",
): Promise<Result<readonly number[], string>> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    let settled = false;
    let deadline: NodeJS.Timeout | undefined;
    const finish = (result: Result<readonly number[], string>): void => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    };
    deadline = setTimeout(() => finish(err("anchor control request timed out")), 1_000);
    socket.setTimeout(1_000, () => finish(err("anchor control request timed out")));
    let data = "";
    socket.on("error", (error) => finish(err(error.message)));
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => {
      try {
        const parsed: unknown = JSON.parse(data);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          !("ok" in parsed) ||
          parsed.ok !== true
        ) {
          finish(err("anchor refused control request"));
          return;
        }
        const members =
          "members" in parsed && Array.isArray(parsed.members)
            ? parsed.members.filter((member): member is number => typeof member === "number")
            : [];
        finish(ok(members));
      } catch (error) {
        finish(err(error instanceof Error ? error.message : String(error)));
      }
    });
    socket.on("connect", () => socket.end(`${JSON.stringify({ secret, action })}\n`));
  });
}

async function waitForGroupGone(pgid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!groupAlive(pgid)) return true;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  return !groupAlive(pgid);
}

export type ProgramExit = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly error?: string;
};

const nativeProgramExitScheduler: ProgramExitScheduler = {
  now: () => Date.now(),
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (timer) => clearTimeout(timer),
};

const nativeProgramExitWatch = (
  path: string,
  listener: (eventType: string, filename: string | Buffer | null) => void,
): ProgramExitWatcher => watch(path, listener);

function readProgramExit(exitPath: string): ProgramExit | undefined {
  if (!existsSync(exitPath)) return undefined;
  const parsed: unknown = JSON.parse(readFileSync(exitPath, "utf8"));
  if (isRecordWithString(parsed, "error")) {
    const error = parsed["error"];
    return error === undefined ? { code: null, signal: null } : { code: null, signal: null, error };
  }
  if (typeof parsed !== "object" || parsed === null || !("code" in parsed) || !("signal" in parsed))
    return undefined;
  const code = typeof parsed.code === "number" || parsed.code === null ? parsed.code : null;
  const signal = isSignal(parsed.signal) ? parsed.signal : null;
  return { code, signal };
}

function readObservedProgramExit(
  exitPath: string,
  observation: ProgramExitObservation | undefined,
): ProgramExit | undefined {
  return observation?.read === undefined ? readProgramExit(exitPath) : observation.read(exitPath);
}

export async function waitForProgramExit(
  exitPath: string,
  timeoutMs: number,
  observation: ProgramExitObservation | undefined,
): Promise<ProgramExit | undefined> {
  const existing = readObservedProgramExit(exitPath, observation);
  if (existing !== undefined) return Promise.resolve(existing);
  const scheduler = observation?.scheduler ?? nativeProgramExitScheduler;
  const observeWith = observation?.watch ?? nativeProgramExitWatch;
  const pollMs = Math.max(1, observation?.pollMs ?? 50);
  return new Promise((resolve) => {
    let settled = false;
    let watcher: ProgramExitWatcher | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (result: ProgramExit | undefined): void => {
      if (settled) return;
      settled = true;
      watcher?.close();
      if (timer !== undefined) scheduler.clearTimeout(timer);
      resolve(result);
    };
    const observe = (): void => {
      const result = readObservedProgramExit(exitPath, observation);
      if (result !== undefined) finish(result);
    };
    const deadline = scheduler.now() + timeoutMs;
    const poll = (): void => {
      if (settled) return;
      observe();
      if (settled) return;
      const remaining = deadline - scheduler.now();
      if (remaining <= 0) {
        finish(undefined);
        return;
      }
      timer = scheduler.setTimeout(poll, Math.min(pollMs, remaining));
    };
    try {
      watcher = observeWith(dirname(exitPath), () => observe());
      watcher.on("error", () => undefined);
    } catch {}
    observe();
    if (!settled) poll();
  });
}

function isSignal(value: unknown): value is NodeJS.Signals {
  return (
    value === "SIGABRT" ||
    value === "SIGALRM" ||
    value === "SIGBUS" ||
    value === "SIGCHLD" ||
    value === "SIGCONT" ||
    value === "SIGFPE" ||
    value === "SIGHUP" ||
    value === "SIGILL" ||
    value === "SIGINT" ||
    value === "SIGIO" ||
    value === "SIGIOT" ||
    value === "SIGKILL" ||
    value === "SIGPIPE" ||
    value === "SIGPOLL" ||
    value === "SIGPROF" ||
    value === "SIGPWR" ||
    value === "SIGQUIT" ||
    value === "SIGSEGV" ||
    value === "SIGSTKFLT" ||
    value === "SIGSTOP" ||
    value === "SIGSYS" ||
    value === "SIGTERM" ||
    value === "SIGTRAP" ||
    value === "SIGTSTP" ||
    value === "SIGTTIN" ||
    value === "SIGTTOU" ||
    value === "SIGURG" ||
    value === "SIGUSR1" ||
    value === "SIGUSR2" ||
    value === "SIGVTALRM" ||
    value === "SIGWINCH" ||
    value === "SIGXCPU" ||
    value === "SIGXFSZ"
  );
}

function initialRecord(
  request: ExecPhaseRequest,
  runDir: string,
  nonce: string,
  secret: string,
): ExecSessionRecord {
  const id = request.id ?? randomUUID();
  return {
    interlock: SESSION_SHAPE,
    id,
    phase: request.phase,
    phaseId: request.phaseId ?? request.phase,
    parentId: request.parentId ?? null,
    kind: request.kind ?? "node",
    graph: request.graph,
    node: request.node ?? null,
    lens: request.lens ?? null,
    subjectHash: request.subjectHash ?? null,
    snapshotHash: request.snapshotHash ?? null,
    arc: request.arc ?? null,
    runtime: request.runtime,
    model: request.model,
    pid: null,
    pgid: null,
    runnerPid: process.pid,
    runnerBirth: `${process.pid}-${process.ppid}`,
    runnerBoot: process.platform,
    launchNonce: nonce,
    controlSecret: secret,
    startedAt: now(),
    endedAt: null,
    state: "running",
    exitCode: null,
    signal: null,
    reason: null,
    reaped: 0,
    captureComplete: false,
    asks: [],
    waitingOnAsk: false,
    transcriptPath: join(runDir, "transcript.jsonl"),
    sampledMembers: [],
    goIntent: false,
  };
}

function launcherSpec(request: ExecPhaseRequest, secret: string): string {
  return JSON.stringify({
    program: request.program,
    args: request.args,
    cwd: request.cwd,
    env: { ...process.env, ...(request.env ?? {}) },
    prompt: request.prompt,
    promptOnStdin: request.promptOnStdin === true,
    secret,
  });
}

type CaptureStreamState = {
  pending: string;
  ended: boolean;
  closedBeforeEnd: boolean;
  outstanding: number;
};

type CaptureDrain = {
  readonly complete: boolean;
  readonly settled: boolean;
  readonly reason: string | undefined;
};

class CaptureController {
  private readonly streams: Record<"stdout" | "stderr", CaptureStreamState> = {
    stdout: { pending: "", ended: false, closedBeforeEnd: false, outstanding: 0 },
    stderr: { pending: "", ended: false, closedBeforeEnd: false, outstanding: 0 },
  };
  private drainResolver: (() => void) | undefined;
  private drainReady = false;

  constructor(
    private readonly child: OwnedProcess,
    private readonly writer: TranscriptWriter,
    private readonly delivery: CaptureStreamDelivery,
  ) {
    this.delivery.attach(this.child, {
      onData: (stream, chunk) => this.onData(stream, chunk),
      onEnd: (stream) => this.onEnd(stream),
      onClose: (stream) => this.onClose(stream),
    });
    if (this.delivery.processCloseIsNormal !== false) {
      this.child.once("close", (_code, signal) => {
        if (signal === null) {
          this.onEnd("stdout");
          this.onEnd("stderr");
        }
      });
    }
    if (this.child.stdout.readableEnded) this.onEnd("stdout");
    if (this.child.stderr.readableEnded) this.onEnd("stderr");
    if (this.child.stdout.destroyed && !this.child.stdout.readableEnded) this.onClose("stdout");
    if (this.child.stderr.destroyed && !this.child.stderr.readableEnded) this.onClose("stderr");
    this.checkDrain();
  }

  async drain(drainGraceMs: number, timers: CaptureTimers): Promise<CaptureDrain> {
    const ready = new Promise<void>((resolve) => {
      this.drainResolver = resolve;
      this.checkDrain();
    });
    const expired = new Promise<void>((resolve) => {
      const timer = timers.setTimeout(() => {
        timers.clearTimeout(timer);
        resolve();
      }, drainGraceMs);
    });
    await Promise.race([ready, expired]);
    if (this.drainReady) {
      this.writer.seal();
      return {
        complete: this.isComplete(),
        settled: true,
        reason: this.reason(),
      };
    }
    this.writer.seal();
    this.child.stdout.destroy();
    this.child.stderr.destroy();
    return { complete: false, settled: false, reason: this.reason() };
  }

  complete(): boolean {
    return this.isComplete();
  }

  reason(): string | undefined {
    if (this.writer.failure() !== undefined)
      return `transcript write failed: ${this.writer.failure()}`;
    if (this.writer.isSealed() && !this.drainReady)
      return "a stream did not end normally within the drain grace";
    if (this.streams.stdout.closedBeforeEnd || this.streams.stderr.closedBeforeEnd)
      return "a stream was destroyed before it ended normally";
    return undefined;
  }

  private onData(stream: "stdout" | "stderr", chunk: string): void {
    const state = this.streams[stream];
    state.pending += chunk;
    const lines = state.pending.split(/\r?\n/);
    state.pending = lines.pop() ?? "";
    for (const text of lines) this.enqueue(stream, text);
  }

  private onEnd(stream: "stdout" | "stderr"): void {
    const state = this.streams[stream];
    if (state.ended) return;
    state.ended = true;
    state.closedBeforeEnd = false;
    if (state.pending.length > 0) {
      const text = state.pending;
      state.pending = "";
      this.enqueue(stream, text);
    }
    this.checkDrain();
  }

  private onClose(stream: "stdout" | "stderr"): void {
    const state = this.streams[stream];
    if (!state.ended) state.closedBeforeEnd = true;
    this.checkDrain();
  }

  private enqueue(stream: "stdout" | "stderr", text: string): void {
    const state = this.streams[stream];
    state.outstanding += 1;
    void this.writer.append({ interlock: TRANSCRIPT_SHAPE, ts: now(), stream, text }).then(() => {
      state.outstanding -= 1;
      this.checkDrain();
    });
  }

  private isComplete(): boolean {
    return (
      this.drainReady &&
      !this.streams.stdout.closedBeforeEnd &&
      !this.streams.stderr.closedBeforeEnd &&
      this.writer.failure() === undefined
    );
  }

  private checkDrain(): void {
    if (
      this.streams.stdout.ended &&
      this.streams.stderr.ended &&
      this.streams.stdout.outstanding === 0 &&
      this.streams.stderr.outstanding === 0
    ) {
      this.drainReady = true;
      this.drainResolver?.();
      this.drainResolver = undefined;
    }
  }
}

const nativeCaptureStreamDelivery: CaptureStreamDelivery = {
  attach: (child, handlers) => {
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => handlers.onData("stdout", chunk));
    child.stderr.on("data", (chunk: string) => handlers.onData("stderr", chunk));
    child.stdout.on("end", () => handlers.onEnd("stdout"));
    child.stderr.on("end", () => handlers.onEnd("stderr"));
    child.stdout.on("close", () => {
      if (!child.stdout.readableAborted) handlers.onEnd("stdout");
      handlers.onClose("stdout");
    });
    child.stderr.on("close", () => {
      if (!child.stderr.readableAborted) handlers.onEnd("stderr");
      handlers.onClose("stderr");
    });
  },
};

async function waitForSettled(
  writer: TranscriptWriter,
  settleMs: number,
  timers: CaptureTimers,
): Promise<boolean> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise((resolve) => {
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) timers.clearTimeout(timer);
      resolve(value && writer.failure() === undefined);
    };
    timer = timers.setTimeout(() => finish(false), settleMs);
    void writer.waitForIdle().then(() => finish(true));
  });
}

async function waitForLauncherClose(
  launcherExit: Promise<unknown>,
  timeoutMs: number,
  timers: CaptureTimers,
): Promise<boolean> {
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  return new Promise((resolve) => {
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) timers.clearTimeout(timer);
      resolve(value);
    };
    timer = timers.setTimeout(() => finish(false), timeoutMs);
    void launcherExit.then(() => finish(true));
  });
}

async function settleCapture(
  capture: CaptureController,
  writer: TranscriptWriter,
  drainGraceMs: number,
  settleMs: number,
  timers: CaptureTimers,
): Promise<CaptureDrain> {
  const drained = await capture.drain(drainGraceMs, timers);
  if (drained.settled) return drained;
  const settled = await waitForSettled(writer, settleMs, timers);
  return {
    complete: drained.complete && settled,
    settled,
    reason:
      writer.failure() === undefined
        ? settled
          ? drained.reason
          : "a transcript write remained unsettled after the settle bound"
        : `transcript write failed: ${writer.failure()}`,
  };
}

export async function runExecPhase(
  request: ExecPhaseRequest,
): Promise<Result<ExecPhaseOutcome, ExecRuntimeRefusal>> {
  const id = request.id ?? randomUUID();
  const phaseId = request.phaseId ?? request.phase;
  const runDir = join(request.runRoot, id, phaseId);
  const transcriptPath = join(runDir, "transcript.jsonl");
  const nonce = randomBytes(16).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const uid = process.getuid?.() ?? process.pid;
  const socketPath = join(tmpdir(), `interlock-${uid}`, `${randomBytes(8).toString("hex")}.sock`);
  const record = initialRecord({ ...request, id, phaseId }, runDir, nonce, secret);
  const writer = new TranscriptWriter(
    transcriptPath,
    request.transcriptSink ?? nativeTranscriptSink,
  );
  try {
    await mkdir(runDir, { recursive: true, mode: 0o700 });
    await mkdir(dirname(socketPath), { recursive: true, mode: 0o700 });
    writeFileSync(transcriptPath, "", { mode: 0o600 });
    await publishRecord(runDir, record);
  } catch (error) {
    return err({ kind: "record", because: error instanceof Error ? error.message : String(error) });
  }
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: `started exec phase ${id}/${phaseId} with launch nonce ${nonce}; containment is the detached process group`,
  });
  if (request.admission !== undefined) {
    const admitted = await request.admission.admit();
    if (isErr(admitted)) {
      void writer.append({
        interlock: TRANSCRIPT_SHAPE,
        ts: now(),
        stream: "runner",
        text: admitted.error,
      });
      void writer.append({
        interlock: TRANSCRIPT_SHAPE,
        ts: now(),
        stream: "runner",
        text: `ended failed; group confirmed empty; capture ${writer.failure() === undefined ? "complete" : "incomplete"}`,
      });
      await writer.waitForIdle();
      const refused: ExecSessionRecord = {
        ...record,
        state: "failed",
        endedAt: now(),
        reason: admitted.error,
        captureComplete: writer.failure() === undefined,
      };
      await publishRecord(runDir, refused);
      return err({ kind: "machine", because: admitted.error });
    }
  }

  const launcher =
    request.launcherPath ?? fileURLToPath(new URL("./execLauncher.ts", import.meta.url));
  const executable = request.nodeExecutable ?? process.execPath;
  let child: OwnedProcess;
  try {
    child = spawnOwned(
      [executable, launcher, runDir, nonce, socketPath],
      request.cwd,
      { ...process.env, ...(request.env ?? {}) },
      true,
    );
  } catch (error) {
    const reason = `could not start: ${error instanceof Error && "code" in error ? String(error.code) : "unknown"}`;
    void writer.append({ interlock: TRANSCRIPT_SHAPE, ts: now(), stream: "runner", text: reason });
    void writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: `ended failed; group confirmed empty; capture ${writer.failure() === undefined ? "complete" : "incomplete"}`,
    });
    await writer.waitForIdle();
    const failed: ExecSessionRecord = {
      ...record,
      state: "failed",
      endedAt: now(),
      reason,
      captureComplete: writer.failure() === undefined,
    };
    await publishRecord(runDir, failed);
    if (request.admission !== undefined) await request.admission.release("never-started", "");
    return err({ kind: "launch", because: reason });
  }
  let launcherStartError: string | undefined;
  let launcherExited = false;
  let launcherExitCode: number | null = null;
  child.once("error", (error) => {
    if ("code" in error && typeof error.code === "string") launcherStartError = error.code;
  });
  child.once("close", (code) => {
    launcherExited = true;
    launcherExitCode = code;
  });
  child.stdin.on("error", () => {});
  const capture = new CaptureController(
    child,
    writer,
    request.captureStreamDelivery ?? nativeCaptureStreamDelivery,
  );
  const captureTimers = request.captureTimers ?? nativeCaptureTimers;
  const drainGraceMs = request.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS;
  const captureSettleMs = request.captureSettleMs ?? DEFAULT_CAPTURE_SETTLE_MS;
  child.stdin.write(`${launcherSpec(request, secret)}\n`);

  const anchorPath = join(runDir, "anchor.json");
  const anchorDeadline = Date.now() + 30_000;
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: "waiting for launcher anchor",
  });
  while (
    !existsSync(anchorPath) &&
    launcherStartError === undefined &&
    !launcherExited &&
    Date.now() < anchorDeadline
  )
    await new Promise<void>((resolve) => setImmediate(resolve));
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: existsSync(anchorPath) ? "launcher anchor observed" : "launcher anchor missing",
  });
  if (!existsSync(anchorPath)) {
    if (launcherStartError !== undefined) {
      const reason = `could not start: ${launcherStartError}`;
      void writer.append({
        interlock: TRANSCRIPT_SHAPE,
        ts: now(),
        stream: "runner",
        text: reason,
      });
      const captureResult = await settleCapture(
        capture,
        writer,
        drainGraceMs,
        captureSettleMs,
        captureTimers,
      );
      const groupConfirmedEmpty =
        child.pid === undefined
          ? true
          : await waitForGroupGone(child.pid, request.termGraceMs ?? DEFAULT_TERM_GRACE_MS);
      const closingWrite = writer.append({
        interlock: TRANSCRIPT_SHAPE,
        ts: now(),
        stream: "runner",
        text: `ended failed; group ${groupConfirmedEmpty ? "confirmed empty" : "not confirmed empty"}; capture ${captureResult.complete ? "complete" : "incomplete"}${captureResult.reason === undefined ? "" : `: ${captureResult.reason}`}`,
      });
      const closingWritten = captureResult.settled ? await closingWrite : false;
      const failed: ExecSessionRecord = {
        ...record,
        state: "failed",
        endedAt: now(),
        reason,
        captureComplete: captureResult.complete && closingWritten,
      };
      await publishRecord(runDir, failed);
      if (request.admission !== undefined) await request.admission.release("never-started", "");
      return err({ kind: "launch", because: reason });
    }
    const code = launcherExitCode ?? 1;
    const reason = `launcher failed before its anchor: exit ${code}`;
    void writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: reason,
    });
    const captureResult = await settleCapture(
      capture,
      writer,
      drainGraceMs,
      captureSettleMs,
      captureTimers,
    );
    const groupConfirmedEmpty =
      child.pid === undefined
        ? true
        : await waitForGroupGone(child.pid, request.termGraceMs ?? DEFAULT_TERM_GRACE_MS);
    const closingWrite = writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: `ended failed; group ${groupConfirmedEmpty ? "confirmed empty" : "not confirmed empty"}; capture ${captureResult.complete ? "complete" : "incomplete"}${captureResult.reason === undefined ? "" : `: ${captureResult.reason}`}`,
    });
    const closingWritten = captureResult.settled ? await closingWrite : false;
    const failed: ExecSessionRecord = {
      ...record,
      pid: child.pid ?? null,
      pgid: child.pid ?? null,
      state: "failed",
      endedAt: now(),
      reason,
      captureComplete: captureResult.complete && closingWritten,
    };
    await publishRecord(runDir, failed);
    if (request.admission !== undefined)
      await request.admission.release(
        "group-empty",
        child.pid === undefined ? "" : String(child.pid),
      );
    return err({ kind: "launch", because: reason });
  }
  const anchorValue: unknown = JSON.parse(readFileSync(anchorPath, "utf8"));
  if (!isAnchor(anchorValue, child.pid)) {
    const reason = "runner lost the process";
    const captureResult = await settleCapture(
      capture,
      writer,
      drainGraceMs,
      captureSettleMs,
      captureTimers,
    );
    const closingWrite = writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: `ended failed; group not confirmed empty; capture ${captureResult.complete ? "complete" : "incomplete"}${captureResult.reason === undefined ? "" : `: ${captureResult.reason}`}`,
    });
    const closingWritten = captureResult.settled ? await closingWrite : false;
    const failed: ExecSessionRecord = {
      ...record,
      pid: child.pid ?? null,
      pgid: child.pid ?? null,
      state: "failed",
      endedAt: now(),
      reason,
      captureComplete: captureResult.complete && closingWritten,
    };
    await publishRecord(runDir, failed);
    return err({ kind: "lost-anchor", because: reason });
  }
  const anchor = anchorValue;
  let current: ExecSessionRecord = {
    ...record,
    pid: anchor.pid,
    pgid: anchor.pgid,
  };
  await publishRecord(runDir, current);
  if (request.admission !== undefined) {
    const bound = await request.admission.bind(anchor);
    if (isErr(bound)) {
      await connectControl(socketPath, secret, "end");
      const groupConfirmedEmpty = await waitForGroupGone(
        anchor.pgid,
        request.termGraceMs ?? DEFAULT_TERM_GRACE_MS,
      );
      const reason = bound.error;
      const captureResult = await settleCapture(
        capture,
        writer,
        drainGraceMs,
        captureSettleMs,
        captureTimers,
      );
      const closingWrite = writer.append({
        interlock: TRANSCRIPT_SHAPE,
        ts: now(),
        stream: "runner",
        text: `ended failed; group ${groupConfirmedEmpty ? "confirmed empty" : "not confirmed empty"}; capture ${captureResult.complete ? "complete" : "incomplete"}${captureResult.reason === undefined ? "" : `: ${captureResult.reason}`}`,
      });
      const closingWritten = captureResult.settled ? await closingWrite : false;
      current = {
        ...current,
        state: "failed",
        endedAt: now(),
        reason,
        captureComplete: captureResult.complete && closingWritten,
      };
      await publishRecord(runDir, current);
      await request.admission.release("group-empty", String(anchor.pgid));
      return err({ kind: "machine", because: reason });
    }
  }
  const go = { ...current, goIntent: true };
  await publishRecord(runDir, go);
  current = go;
  child.stdin.write("go\n");
  let timedOut = false;
  let launcherConfirmedDead = false;
  const launcherExit = new Promise<{
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.on("close", (code: number | null, signal: NodeJS.Signals | null) => {
      launcherConfirmedDead = true;
      resolve({ code, signal });
    });
  });
  const exitFile = join(runDir, "exit.json");
  let exit = await waitForProgramExit(exitFile, request.timeoutMs, request.programExitObservation);
  if (exit === undefined) {
    timedOut = true;
    void writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: `run timeout ${request.timeoutMs}ms; requesting TERM from the group anchor`,
    });
    current = { ...current, reason: `run timeout ${request.timeoutMs}ms` };
    await publishRecord(runDir, current);
    await connectControl(socketPath, secret, "TERM");
    exit = await waitForProgramExit(
      exitFile,
      request.termGraceMs ?? DEFAULT_TERM_GRACE_MS,
      request.programExitObservation,
    );
    if (exit === undefined) {
      await connectControl(socketPath, secret, "KILL");
      await Promise.race([
        launcherExit,
        new Promise<void>((resolve) =>
          setTimeout(resolve, request.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS),
        ),
      ]);
      exit = await waitForProgramExit(
        exitFile,
        request.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS,
        request.programExitObservation,
      );
    }
  }
  if (exit === undefined) {
    await Promise.race([
      launcherExit,
      new Promise<void>((resolve) =>
        setTimeout(resolve, request.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS),
      ),
    ]);
    exit = await waitForProgramExit(
      exitFile,
      request.drainGraceMs ?? DEFAULT_DRAIN_GRACE_MS,
      request.programExitObservation,
    );
  }
  if (exit === undefined) exit = { code: null, signal: "SIGKILL" };
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: launcherConfirmedDead
      ? "launcher confirmed dead; reconciling program exit evidence"
      : "launcher death not confirmed after bounded exit wait; reconciling available program exit evidence",
  });
  const reconciledExit = readObservedProgramExit(exitFile, request.programExitObservation);
  if (reconciledExit !== undefined) exit = reconciledExit;
  const programError = exit.error;
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: "sampling group members",
  });
  const members = await connectControl(socketPath, secret, "members");
  const reaped = isOk(members) ? members.value.length : 0;
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: `sampled ${String(reaped)} group member(s)`,
  });
  if (isOk(members) && members.value.length > 0) {
    void writer.append({
      interlock: TRANSCRIPT_SHAPE,
      ts: now(),
      stream: "runner",
      text: `TERM sent by group anchor for ${String(reaped)} reaped member(s)`,
    });
    await connectControl(socketPath, secret, "TERM");
    const termGone = await waitForGroupGone(
      anchor.pgid,
      request.termGraceMs ?? DEFAULT_TERM_GRACE_MS,
    );
    if (!termGone) await connectControl(socketPath, secret, "KILL");
  }
  void writer.append({
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner",
    text: "ending group anchor",
  });
  const endedByAnchor = await connectControl(socketPath, secret, "end");
  if (isErr(endedByAnchor)) await connectControl(socketPath, secret, "KILL");
  const groupConfirmedEmpty = await waitForGroupGone(
    anchor.pgid,
    request.termGraceMs ?? DEFAULT_TERM_GRACE_MS,
  );
  if (request.captureStreamDelivery?.processCloseIsNormal !== false)
    await waitForLauncherClose(launcherExit, drainGraceMs, captureTimers);
  const captureResult = await settleCapture(
    capture,
    writer,
    drainGraceMs,
    captureSettleMs,
    captureTimers,
  );
  const finalState: ExecPhaseState =
    programError !== undefined
      ? "failed"
      : timedOut
        ? "killed"
        : exit.signal !== null || exit.code !== 0
          ? "failed"
          : "done";
  const captureReason = captureResult.reason;
  const closeLine: ExecTranscriptLine = {
    interlock: TRANSCRIPT_SHAPE,
    ts: now(),
    stream: "runner" as const,
    text: `ended ${finalState}; group ${groupConfirmedEmpty ? "confirmed empty" : "not confirmed empty"}; capture ${captureResult.complete ? "complete" : "incomplete"}${captureReason === undefined ? "" : `: ${captureReason}`}`,
  };
  const closingWrite = writer.append(closeLine);
  const closingWritten = captureResult.settled ? await closingWrite : false;
  const captureComplete = captureResult.complete && closingWritten;
  const final: ExecSessionRecord = {
    ...current,
    endedAt: now(),
    state: finalState,
    exitCode: exit.code,
    signal: exit.signal,
    reason:
      programError !== undefined
        ? `program could not start: ${programError}`
        : timedOut
          ? `run timeout ${request.timeoutMs}ms`
          : exit.signal === null && exit.code === 0
            ? null
            : exit.signal === null
              ? `exit ${exit.code ?? 1}`
              : `ended by ${exit.signal} from outside the runner`,
    reaped,
    captureComplete,
  };
  await publishRecord(runDir, final);
  if (request.admission !== undefined)
    await request.admission.release("group-empty", String(anchor.pgid));
  return ok({ record: final, runDir });
}

function isAnchor(
  value: unknown,
  pid: number | undefined,
): value is {
  readonly pid: number;
  readonly pgid: number;
  readonly birth: string;
  readonly boot: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "pid" in value &&
    value.pid === pid &&
    "pgid" in value &&
    value.pgid === pid &&
    "birth" in value &&
    typeof value.birth === "string" &&
    "boot" in value &&
    typeof value.boot === "string"
  );
}

function isRecordWithString(value: unknown, key: string): value is Record<string, string> {
  if (typeof value !== "object" || value === null || !(key in value)) return false;
  const record: Record<string, unknown> = Object.fromEntries(Object.entries(value));
  return typeof record[key] === "string";
}

function sessionView(record: ExecSessionRecord): ExecSessionView {
  const {
    interlock: _recordShape,
    runnerPid: _runnerPid,
    runnerBirth: _runnerBirth,
    runnerBoot: _runnerBoot,
    launchNonce: _launchNonce,
    controlSecret: _controlSecret,
    goIntent: _goIntent,
    sampledMembers: _sampledMembers,
    ...view
  } = record;
  return { interlock: "sessions@v0", ...view };
}

export async function listExecSessions(
  runRoot: string,
  liveOnly = false,
): Promise<readonly ExecSessionView[]> {
  if (!existsSync(runRoot)) return [];
  const records: ExecSessionView[] = [];
  for (const id of readdirSync(runRoot)) {
    const sessionDir = join(runRoot, id);
    if (!existsSync(sessionDir)) continue;
    for (const phaseId of readdirSync(sessionDir)) {
      const record = readLatestRecord(join(sessionDir, phaseId));
      if (record !== undefined && (!liveOnly || record.state === "running"))
        records.push(sessionView(record));
    }
  }
  return records.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readExecTranscript(runDir: string): Promise<readonly ExecTranscriptLine[]> {
  try {
    const raw = await readFile(join(runDir, "transcript.jsonl"), "utf8");
    const lines: ExecTranscriptLine[] = [];
    for (const line of raw.split("\n").filter((candidate) => candidate.length > 0)) {
      const parsed: unknown = JSON.parse(line);
      if (isTranscriptLine(parsed)) lines.push(parsed);
    }
    return lines;
  } catch {
    return [];
  }
}

function isTranscriptLine(value: unknown): value is ExecTranscriptLine {
  if (
    typeof value !== "object" ||
    value === null ||
    !("interlock" in value) ||
    value.interlock !== TRANSCRIPT_SHAPE
  )
    return false;
  return (
    "ts" in value &&
    typeof value.ts === "string" &&
    "stream" in value &&
    (value.stream === "stdout" || value.stream === "stderr" || value.stream === "runner") &&
    "text" in value &&
    typeof value.text === "string"
  );
}

export async function removeExecRun(runDir: string): Promise<void> {
  await rm(runDir, { recursive: true, force: true });
}

export function execRunRoot(commonGitDir: string): string {
  return join(commonGitDir, "interlock", "runs");
}

export function execSocketPathLength(socketPath: string): number {
  return Buffer.byteLength(socketPath);
}

export function execSocketSecretDigest(secret: string): string {
  return idHash(secret);
}
