import { createHash } from "node:crypto";
import type { Clock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  derivation,
  heldOn,
  type Ledger,
  type Node,
  nodeKey,
  OUTBOX_INTENT_SHAPE,
  outcome,
  retainOutboxArtifact,
} from "ledger";
import { createHerdrLaunchRuntime } from "./herdr/adapter.ts";
import { runProviderCommand, stringEnvironment } from "./machineProvider.ts";
import { explainRuntimeRefusal, type Runtime } from "./runtime.ts";
import { isRecord, isStringArray, prop } from "./validate.ts";

export interface MachineHold {
  readonly token: string;
  readonly pane: string;
  readonly cwd: string;
  readonly release: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

export type MachineOperation = "admit" | "close" | "release" | "agent";

function idFor(operation: MachineOperation, hold: MachineHold): string {
  return createHash("sha256")
    .update(JSON.stringify(["machine-provider", operation, hold.token, hold.pane]))
    .digest("hex");
}

function evidence(ledger: Ledger, id: string) {
  const view = ledger.projection().outbox.get(id);
  return view === undefined
    ? undefined
    : ledger.readOutboxEvidence(view.intent.node, view.intent.session, id);
}

function acknowledged(ledger: Ledger, id: string): boolean {
  const read = evidence(ledger, id);
  return (
    read?.kind === "verified" &&
    read.delivery?.state === "acknowledged" &&
    read.acknowledgment !== undefined
  );
}

export function machineIntent(
  ledger: Ledger,
  node: Node,
  session: string,
  operation: MachineOperation,
  hold: MachineHold,
): Result<string, string> {
  const id = idFor(operation, hold);
  const body = Buffer.from(
    JSON.stringify({
      token: hold.token,
      pane: hold.pane,
      cwd: hold.cwd,
      release: hold.release,
      env: hold.env,
    }),
  );
  const existing = evidence(ledger, id);
  if (existing !== undefined) {
    return existing.kind === "verified" && existing.request.equals(body)
      ? ok(id)
      : err(`machine ${operation}: retained intent is unavailable or conflicts`);
  }
  const request = retainOutboxArtifact(ledger.directory(), "request", body);
  if (isErr(request)) return err(`machine ${operation}: cannot retain intent evidence`);
  const saved = ledger.appendConfirmed({
    kind: "outbox-intent-recorded",
    node,
    effect: {
      interlock: OUTBOX_INTENT_SHAPE,
      id,
      node,
      session,
      target: `machine-provider/${operation}`,
      request: request.value,
      derivation: derivation.gate("machine-provider", "runner@0", `machine-${session}`),
    },
  });
  return isErr(saved) ? err(`machine ${operation}: cannot confirm intent`) : ok(id);
}

export function machineDelivery(
  ledger: Ledger,
  id: string,
  result: Result<unknown, string>,
): Result<void, string> {
  const producer = ledger.projection().outbox.get(id)?.intent.derivation;
  if (producer === undefined) return err("machine delivery has no confirmed intent");
  if (isErr(result)) {
    const saved = ledger.appendConfirmed({
      kind: "outbox-delivery-recorded",
      delivery: {
        id,
        state: "uncertain",
        because: result.error,
        derivation: producer,
      },
    });
    return err(isErr(saved) ? `${result.error}; cannot retain uncertainty` : result.error);
  }
  const acknowledgment = retainOutboxArtifact(
    ledger.directory(),
    "acknowledgment",
    Buffer.from(JSON.stringify(result.value)),
  );
  if (isErr(acknowledgment))
    return machineDelivery(ledger, id, err("cannot retain machine acknowledgment"));
  const saved = ledger.appendConfirmed({
    kind: "outbox-delivery-recorded",
    delivery: {
      id,
      state: "acknowledged",
      because: "confirmed machine effect",
      derivation: producer,
      acknowledgment: acknowledgment.value,
    },
  });
  return isErr(saved)
    ? err("cannot confirm machine delivery; delivery is uncertain")
    : ok(undefined);
}

export async function admitMachine(
  ledger: Ledger,
  node: Node,
  session: string,
  hold: MachineHold,
  command: readonly string[],
): Promise<Result<void, string>> {
  const intent = machineIntent(ledger, node, session, "admit", hold);
  if (isErr(intent)) return intent;
  const result = await runProviderCommand(command, hold.cwd, { ...process.env, ...hold.env });
  const saved = machineDelivery(ledger, intent.value, ok(result));
  if (isErr(saved)) return saved;
  return result.code === 0
    ? ok(undefined)
    : err(
        result.output.length > 0
          ? (result.output.split(/\r?\n/)[0] ?? "")
          : `machine.provider.admit exited ${result.code}`,
      );
}

function releaseRequired(ledger: Ledger, hold: MachineHold): Result<boolean, string> {
  if (hold.release.length === 0) return ok(false);
  const admission = evidence(ledger, idFor("admit", hold));
  if (admission === undefined) return ok(true);
  if (admission.kind !== "verified") return err("machine admission evidence is unavailable");
  if (admission.delivery?.state !== "acknowledged" || admission.acknowledgment === undefined)
    return ok(true);
  let value: unknown;
  try {
    value = JSON.parse(admission.acknowledgment.toString("utf8"));
  } catch {
    return err("machine admission acknowledgment is malformed");
  }
  const code = isRecord(value) ? prop(value, "code") : undefined;
  return typeof code === "number" && Number.isInteger(code)
    ? ok(code === 0)
    : err("machine admission acknowledgment has no exit code");
}

export async function closeMachinePane(
  ledger: Ledger,
  runtime: Runtime,
  node: Node,
  session: string,
  hold: MachineHold,
): Promise<Result<void, string>> {
  const close = machineIntent(ledger, node, session, "close", hold);
  if (isErr(close)) return close;
  const required = releaseRequired(ledger, hold);
  if (isErr(required)) return required;
  const release = required.value
    ? machineIntent(ledger, node, session, "release", hold)
    : undefined;
  if (release !== undefined && isErr(release)) return release;
  if (!acknowledged(ledger, close.value)) {
    const closed = await runtime.closePane({ id: hold.pane });
    const saved = machineDelivery(
      ledger,
      close.value,
      isErr(closed) ? err(explainRuntimeRefusal(closed.error)) : ok({ closed: true }),
    );
    if (isErr(saved)) return saved;
  }
  if (release === undefined || isErr(release) || acknowledged(ledger, release.value))
    return ok(undefined);
  const result = await runProviderCommand(hold.release, hold.cwd, { ...process.env, ...hold.env });
  return machineDelivery(
    ledger,
    release.value,
    result.code === 0
      ? ok(result)
      : err(`machine.provider.release exited ${result.code}: ${result.output}`),
  );
}

function parseHold(value: unknown): MachineHold | undefined {
  if (!isRecord(value)) return undefined;
  const token = prop(value, "token");
  const pane = prop(value, "pane");
  const cwd = prop(value, "cwd");
  const release = prop(value, "release");
  const env = prop(value, "env");
  return typeof token === "string" &&
    typeof pane === "string" &&
    typeof cwd === "string" &&
    isStringArray(release) &&
    stringEnvironment(env)
    ? { token, pane, cwd, release, env }
    : undefined;
}

export async function reconcileMachine(
  ledger: Ledger,
  runtime: Runtime,
  narrate: (line: string) => void,
  clock: Clock,
): Promise<Result<void, string>> {
  const intents = [...ledger.projection().outbox.values()].filter(
    (view) =>
      view.intent.target === "machine-provider/admit" ||
      view.intent.target === "machine-provider/close",
  );
  const seen = new Set<string>();
  for (const view of intents) {
    const read = evidence(ledger, view.intent.id);
    if (read?.kind !== "verified") return err("machine recovery: retained intent is unavailable");
    let value: unknown;
    try {
      value = JSON.parse(read.request.toString("utf8"));
    } catch {
      return err("machine recovery: invalid retained intent");
    }
    const hold = parseHold(value);
    if (hold === undefined) return err("machine recovery: invalid retained pane or token");
    if (seen.has(hold.token)) continue;
    seen.add(hold.token);
    const closing = ledger.projection().outbox.has(idFor("close", hold));
    const agentEvidence = evidence(ledger, idFor("agent", hold));
    if (agentEvidence !== undefined && agentEvidence.kind !== "verified")
      return err(`machine hold ${hold.token} kept: agent delivery evidence is unavailable`);
    if (!closing && acknowledged(ledger, idFor("agent", hold))) continue;
    const kept = (because: string): Result<void, string> => {
      const message = `machine hold ${hold.token} kept: ${because}`;
      narrate(message);
      const receipts = ledger.projection().nodes.get(nodeKey(view.intent.node))?.receipts ?? [];
      const saved = ledger.appendConfirmed({
        kind: "outcome-set",
        node: view.intent.node,
        outcome: outcome.held(
          receipts,
          heldOn.gateFailure("machine provider", "hold"),
          message,
          clock.now().wallMs + 24 * 60 * 60 * 1000,
        ),
      });
      return err(isErr(saved) ? `${message}; cannot retain held outcome` : message);
    };
    const required = releaseRequired(ledger, hold);
    if (isErr(required)) return kept(required.error);
    if (
      acknowledged(ledger, idFor("close", hold)) &&
      (!required.value || acknowledged(ledger, idFor("release", hold)))
    )
      continue;
    if (!acknowledged(ledger, idFor("close", hold))) {
      if (runtime.paneProcess === undefined) return kept("runtime cannot inspect pane");
      const observed = await runtime.paneProcess({ id: hold.pane });
      if (isErr(observed)) return kept(explainRuntimeRefusal(observed.error));
      if (observed.value.state === "gone") {
        const close = machineIntent(ledger, view.intent.node, view.intent.session, "close", hold);
        if (isErr(close)) return close;
        const saved = machineDelivery(ledger, close.value, ok({ gone: true }));
        if (isErr(saved)) return saved;
      }
    }
    const closed = await closeMachinePane(
      ledger,
      runtime,
      view.intent.node,
      view.intent.session,
      hold,
    );
    if (isErr(closed)) return kept(closed.error);
    narrate(
      required.value
        ? `machine hold ${hold.token} released after confirmed close`
        : `machine pane ${hold.pane} close confirmed`,
    );
  }
  return ok(undefined);
}

export async function reconcileMachineOnStart(
  ledger: Ledger,
  clock: Clock,
  narrate: (line: string) => void,
  runtime?: Runtime,
): Promise<Result<void, string>> {
  const needed = [...ledger.projection().outbox.values()].some((view) => {
    if (
      view.intent.target !== "machine-provider/admit" &&
      view.intent.target !== "machine-provider/close"
    )
      return false;
    const read = evidence(ledger, view.intent.id);
    if (read?.kind !== "verified") return true;
    let value: unknown;
    try {
      value = JSON.parse(read.request.toString("utf8"));
    } catch {
      return true;
    }
    const hold = parseHold(value);
    if (hold === undefined) return true;
    const closing = ledger.projection().outbox.has(idFor("close", hold));
    const required = releaseRequired(ledger, hold);
    if (isErr(required)) return true;
    return closing
      ? !acknowledged(ledger, idFor("close", hold)) ||
          (required.value && !acknowledged(ledger, idFor("release", hold)))
      : !acknowledged(ledger, idFor("agent", hold));
  });
  if (!needed) return ok(undefined);
  const created = runtime === undefined ? await createHerdrLaunchRuntime() : ok(runtime);
  if (isErr(created)) {
    const message = `machine holds kept: ${explainRuntimeRefusal(created.error)}`;
    narrate(message);
    return err(message);
  }
  return reconcileMachine(ledger, created.value, narrate, clock);
}
