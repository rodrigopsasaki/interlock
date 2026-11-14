import { createHash } from "node:crypto";
import { connect } from "node:net";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  derivation,
  type Ledger,
  type Node,
  OUTBOX_INTENT_SHAPE,
  type OutboxIntent,
  readOutboxArtifact,
  retainOutboxArtifact,
} from "ledger";

export type ExecStopMode = "phase" | "attempt";

export interface ExecStopTarget {
  readonly graph: string;
  readonly node: string | null;
  readonly session: string;
  readonly phaseId: string;
  readonly controlSocketPath: string | undefined;
  readonly controlSecret: string;
}

export interface StopSignal {
  readonly mode: ExecStopMode;
  readonly by: string;
  readonly because: string;
}

interface ExecStopRequest extends StopSignal {
  readonly graph: string;
  readonly node: string | null;
  readonly session: string;
  readonly phaseId: string;
}

function stopNode(target: ExecStopTarget): Node {
  return { graph: target.graph, id: target.node ?? "review" };
}

function stopRequest(target: ExecStopTarget, by: string, because: string, mode: ExecStopMode) {
  return {
    graph: target.graph,
    node: target.node,
    session: target.session,
    phaseId: target.phaseId,
    by,
    because,
    mode,
  } satisfies ExecStopRequest;
}

function stopId(request: ExecStopRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify(["exec-stop", request.graph, request.node, request.session, request.phaseId]),
    )
    .digest("hex");
}

function runnerDerivation(): ReturnType<typeof derivation.gate> {
  return derivation.gate("exec-stop", "runner@0", "interlock-exec-stop");
}

function readIntentRequest(ledger: Ledger, intent: OutboxIntent): Result<Buffer, string> {
  const read = readOutboxArtifact(ledger.directory(), intent.request);
  return isErr(read) ? err(`exec stop request evidence is ${read.error.kind}`) : ok(read.value);
}

function parseRequest(raw: Buffer): ExecStopRequest | undefined {
  try {
    const value: unknown = JSON.parse(raw.toString("utf8"));
    if (typeof value !== "object" || value === null) return undefined;
    if (!("graph" in value) || typeof value.graph !== "string") return undefined;
    if (!("node" in value) || (value.node !== null && typeof value.node !== "string"))
      return undefined;
    if (!("session" in value) || typeof value.session !== "string") return undefined;
    if (!("phaseId" in value) || typeof value.phaseId !== "string") return undefined;
    if (!("by" in value) || typeof value.by !== "string") return undefined;
    if (!("because" in value) || typeof value.because !== "string") return undefined;
    if (!("mode" in value) || (value.mode !== "phase" && value.mode !== "attempt"))
      return undefined;
    return {
      graph: value.graph,
      node: value.node,
      session: value.session,
      phaseId: value.phaseId,
      by: value.by,
      because: value.because,
      mode: value.mode,
    };
  } catch {
    return undefined;
  }
}

function parsePaneStop(raw: Buffer): StopSignal | undefined {
  try {
    const value: unknown = JSON.parse(raw.toString("utf8"));
    if (typeof value !== "object" || value === null) return undefined;
    const stop = "stop" in value ? value.stop : value;
    if (typeof stop !== "object" || stop === null) return undefined;
    if (!("by" in stop) || typeof stop.by !== "string") return undefined;
    if (!("because" in stop) || typeof stop.because !== "string") return undefined;
    return { mode: "attempt", by: stop.by, because: stop.because };
  } catch {
    return undefined;
  }
}

function existingIntent(
  ledger: Ledger,
  node: Node,
  session: string,
  id: string,
  request: Buffer,
): Result<OutboxIntent, string> {
  const view = ledger.projection().outbox.get(id);
  if (view === undefined) return err("missing");
  const evidence = ledger.readOutboxEvidence(node, session, id);
  if (evidence.kind !== "verified" || !evidence.request.equals(request)) {
    return err("exec stop intent conflicts with retained evidence");
  }
  return ok(view.intent);
}

export function recordExecStopIntent(
  ledger: Ledger,
  target: ExecStopTarget,
  by: string,
  because: string,
  mode: ExecStopMode,
): Result<string, string> {
  const requestValue = stopRequest(target, by, because, mode);
  const request = Buffer.from(JSON.stringify(requestValue));
  const node = stopNode(target);
  const id = stopId(requestValue);
  const existing = existingIntent(ledger, node, target.session, id, request);
  if (!isErr(existing)) return ok(id);
  if (existing.error !== "missing") return err(existing.error);
  const retained = retainOutboxArtifact(ledger.directory(), "request", request);
  if (isErr(retained)) return err("exec stop request evidence could not be retained");
  const intent: OutboxIntent = {
    interlock: OUTBOX_INTENT_SHAPE,
    id,
    node,
    session: target.session,
    target: "exec-stop",
    request: retained.value,
    derivation: runnerDerivation(),
  };
  return isErr(ledger.appendConfirmed({ kind: "outbox-intent-recorded", node, effect: intent }))
    ? err("exec stop intent could not be confirmed")
    : ok(id);
}

function control(
  socketPath: string,
  secret: string,
  action: "TERM" | "KILL",
): Promise<Result<void, string>> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    let settled = false;
    const finish = (result: Result<void, string>): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      socket.destroy();
      resolve(result);
    };
    const timeout = setTimeout(() => finish(err("exec stop control request timed out")), 1_000);
    let data = "";
    socket.on("error", (error) => finish(err(error.message)));
    socket.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    socket.on("end", () => {
      try {
        const parsed: unknown = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null && "ok" in parsed && parsed.ok === true) {
          finish(ok(undefined));
          return;
        }
        finish(err("exec stop control request was refused"));
      } catch (error) {
        finish(err(error instanceof Error ? error.message : String(error)));
      }
    });
    socket.on("connect", () => socket.end(`${JSON.stringify({ secret, action })}\n`));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function dispatchExecStopIntent(
  ledger: Ledger,
  target: ExecStopTarget,
  id: string,
  termGraceMs = 1_000,
): Promise<Result<void, string>> {
  const view = ledger.projection().outbox.get(id);
  if (view === undefined) return err("exec stop intent is not recorded");
  if (view.delivery?.state === "acknowledged") return ok(undefined);
  const term =
    target.controlSocketPath === undefined
      ? err("exec stop control socket is unavailable")
      : await control(target.controlSocketPath, target.controlSecret, "TERM");
  if (isErr(term)) {
    const recorded = ledger.appendConfirmed({
      kind: "outbox-delivery-recorded",
      delivery: {
        id,
        state: "uncertain",
        because: term.error,
        derivation: view.intent.derivation,
      },
    });
    return err(isErr(recorded) ? `${term.error}; uncertainty could not be recorded` : term.error);
  }
  await wait(termGraceMs);
  const kill =
    target.controlSocketPath === undefined
      ? err("exec stop control socket is unavailable")
      : await control(target.controlSocketPath, target.controlSecret, "KILL");
  const acknowledgment = retainOutboxArtifact(
    ledger.directory(),
    "acknowledgment",
    Buffer.from(
      JSON.stringify({ term: "acknowledged", kill: isErr(kill) ? kill.error : "acknowledged" }),
    ),
  );
  if (isErr(acknowledgment)) {
    ledger.appendConfirmed({
      kind: "outbox-delivery-recorded",
      delivery: {
        id,
        state: "uncertain",
        because: "exec stop was dispatched but its acknowledgment could not be retained",
        derivation: view.intent.derivation,
      },
    });
    return err("exec stop acknowledgment could not be retained");
  }
  const recorded = ledger.appendConfirmed({
    kind: "outbox-delivery-recorded",
    delivery: {
      id,
      state: "acknowledged",
      because: isErr(kill)
        ? "TERM was acknowledged; KILL raced phase shutdown"
        : "TERM and KILL dispatched",
      derivation: view.intent.derivation,
      acknowledgment: acknowledgment.value,
    },
  });
  return isErr(recorded) ? err("exec stop delivery could not be recorded") : ok(undefined);
}

export async function stopExecSession(
  ledger: Ledger,
  target: ExecStopTarget,
  by: string,
  because: string,
  mode: ExecStopMode,
  termGraceMs = 1_000,
): Promise<Result<void, string>> {
  const id = recordExecStopIntent(ledger, target, by, because, mode);
  if (isErr(id)) return id;
  return dispatchExecStopIntent(ledger, target, id.value, termGraceMs);
}

export function stopSignalFor(
  ledger: Ledger,
  session: string,
  phaseId: string | undefined,
): StopSignal | undefined {
  for (const view of ledger.projection().outbox.values()) {
    if (view.intent.session !== session) continue;
    const request = readIntentRequest(ledger, view.intent);
    if (isErr(request)) continue;
    if (view.intent.target === "machine-provider/close" && phaseId === undefined) {
      const paneStop = parsePaneStop(request.value);
      if (paneStop !== undefined) return paneStop;
      continue;
    }
    const parsed = parseRequest(request.value);
    if (parsed === undefined || parsed.session !== session) continue;
    if (view.intent.target === "exec-stop" && parsed.phaseId === phaseId) return parsed;
  }
  return undefined;
}

export async function replayExecStopIntents(
  ledger: Ledger,
  targets: readonly ExecStopTarget[],
  termGraceMs = 1_000,
): Promise<readonly string[]> {
  const replayed: string[] = [];
  for (const view of ledger.projection().outbox.values()) {
    if (view.intent.target !== "exec-stop" || view.delivery?.state === "acknowledged") continue;
    const request = readIntentRequest(ledger, view.intent);
    const parsed = isErr(request) ? undefined : parseRequest(request.value);
    const target =
      parsed === undefined
        ? undefined
        : targets.find(
            (candidate) =>
              candidate.graph === parsed.graph &&
              candidate.node === parsed.node &&
              candidate.session === parsed.session &&
              candidate.phaseId === parsed.phaseId,
          );
    if (target === undefined) continue;
    const dispatched = await dispatchExecStopIntent(ledger, target, view.intent.id, termGraceMs);
    if (isErr(dispatched)) continue;
    replayed.push(view.intent.id);
  }
  return replayed;
}
