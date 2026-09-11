import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type {
  Agent,
  AgentIdentity,
  AgentIdentityQuery,
  AgentStatus,
  Pane,
  Runtime,
  RuntimeRefusal,
} from "../runtime.ts";
import { isRecord, isString, prop, stringAt } from "../validate.ts";

export function defaultHerdrSocketPath(): string {
  return join(homedir(), ".config", "herdr", "herdr.sock");
}

const DEFAULT_CALL_TIMEOUT_MS = 30_000;
const AGENT_START_TIMEOUT_MS = 60_000;
const CALL_DEADLINE_MARGIN_MS = 5_000;
export const WAIT_SLICE_MS = 60_000;

// A pane's shell is not guaranteed to have reached its prompt the instant workspace.create
// returns; herdr refuses agent.start with this code until it has. Retried, not fatal.
const AGENT_PANE_BUSY_CODE = "agent_pane_busy";
const PANE_READY_INITIAL_BACKOFF_MS = 500;
const PANE_READY_MAX_BACKOFF_MS = 2_000;

const AGENT_WAIT_SLICE_TIMEOUT_CODE = "timeout";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPaneBusyRefusal(
  refusal: RuntimeRefusal,
): refusal is Extract<RuntimeRefusal, { kind: "remote" }> {
  return refusal.kind === "remote" && refusal.code === AGENT_PANE_BUSY_CODE;
}

function isWaitSliceTimeout(refusal: RuntimeRefusal): boolean {
  return (
    refusal.kind === "remote" && refusal.code === AGENT_WAIT_SLICE_TIMEOUT_CODE
  );
}

// herdr's own rule, from its error text: must start with a lowercase letter and contain only
// lowercase letters, digits, '-' or '_' (1-32 characters).
const AGENT_NAME_PATTERN = /^[a-z][a-z0-9_-]{0,31}$/;

export function isCompliantAgentName(name: string): boolean {
  return AGENT_NAME_PATTERN.test(name);
}

export function generateAgentName(): string {
  const name = `il-${randomUUID().slice(0, 8)}`;
  if (!isCompliantAgentName(name)) {
    throw new Error(
      `generateAgentName produced a name herdr would reject: "${name}"`,
    );
  }
  return name;
}

const AGENT_KINDS: ReadonlySet<string> = new Set([
  "pi",
  "claude",
  "codex",
  "gemini",
  "cursor",
  "devin",
  "agy",
  "cline",
  "omp",
  "mastracode",
  "opencode",
  "copilot",
  "kimi",
  "kiro",
  "droid",
  "amp",
  "grok",
  "hermes",
  "kilo",
  "qodercli",
  "qwen",
  "maki",
]);

const AGENT_STATUSES: ReadonlySet<string> = new Set([
  "idle",
  "working",
  "blocked",
  "done",
  "unknown",
]);

function isAgentStatus(value: unknown): value is AgentStatus {
  return isString(value) && AGENT_STATUSES.has(value);
}

interface RpcSuccess {
  readonly id: string;
  readonly result: Record<string, unknown>;
}

interface RpcFailure {
  readonly id: string;
  readonly error: { readonly code: string; readonly message: string };
}

function parseFrame(line: string): RpcSuccess | RpcFailure | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const id = prop(parsed, "id");
  if (!isString(id)) return undefined;
  const result = prop(parsed, "result");
  if (isRecord(result)) return { id, result };
  const error = prop(parsed, "error");
  const code = isRecord(error) ? prop(error, "code") : undefined;
  const message = isRecord(error) ? prop(error, "message") : undefined;
  if (isString(code) && isString(message)) {
    return { id, error: { code, message } };
  }
  return undefined;
}

// herdr serves one request per connection and closes the socket once its response is written,
// so a call owns its own connection end to end: connect, write one frame, read the matching
// frame, close. Nothing here is reused across calls.
function callHerdr(
  socketPath: string,
  method: string,
  params: Readonly<Record<string, unknown>>,
  timeoutMs: number,
): Promise<Result<Record<string, unknown>, RuntimeRefusal>> {
  return new Promise((resolve) => {
    const id = randomUUID();
    const socket = connect(socketPath);
    let buffer = "";
    let settled = false;

    const settle = (
      result: Result<Record<string, unknown>, RuntimeRefusal>,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    };

    const deadline = setTimeout(() => {
      settle(err({ kind: "call-timeout", method, timeoutMs }));
    }, timeoutMs);

    socket.once("error", () => {
      settle(err({ kind: "no-socket", path: socketPath }));
    });

    socket.once("connect", () => {
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });

    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        const frame = line.trim().length === 0 ? undefined : parseFrame(line);
        if (frame !== undefined && frame.id === id) {
          settle(
            "error" in frame
              ? err({
                  kind: "remote",
                  code: frame.error.code,
                  message: frame.error.message,
                })
              : ok(frame.result),
          );
          return;
        }
        boundary = buffer.indexOf("\n");
      }
    });
  });
}

// One throwaway connection, made and closed before any real call, so a missing herdr refuses
// early with its own reason instead of surfacing as a mysterious first-call timeout.
function verifyHerdrSocket(
  socketPath: string,
): Promise<Result<void, RuntimeRefusal>> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    socket.once("error", () => {
      resolve(err({ kind: "no-socket", path: socketPath }));
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(ok(undefined));
    });
  });
}

export async function createHerdrRuntime(
  socketPath: string = defaultHerdrSocketPath(),
  defaultCallTimeoutMs: number = DEFAULT_CALL_TIMEOUT_MS,
  paneReadyTimeoutMs: number = AGENT_START_TIMEOUT_MS,
  waitSliceMs: number = WAIT_SLICE_MS,
): Promise<Result<Runtime, RuntimeRefusal>> {
  const verified = await verifyHerdrSocket(socketPath);
  if (isErr(verified)) return verified;

  const call = (
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs: number = defaultCallTimeoutMs,
  ) => callHerdr(socketPath, method, params, timeoutMs);

  const attemptStartAgent = async (
    name: string,
    pane: Pane,
    kind: string,
    args: readonly string[],
    onWaitingForPane?: () => void,
  ): Promise<Result<Agent, RuntimeRefusal>> => {
    const params = {
      name,
      kind,
      pane_id: pane.id,
      args,
      timeout_ms: AGENT_START_TIMEOUT_MS,
    };
    const callTimeoutMs = AGENT_START_TIMEOUT_MS + CALL_DEADLINE_MARGIN_MS;

    let attempt = 0;
    let waitedMs = 0;
    let backoffMs = PANE_READY_INITIAL_BACKOFF_MS;
    for (;;) {
      attempt += 1;
      const started = await call("agent.start", params, callTimeoutMs);
      if (!isErr(started)) return ok({ id: name, pane });
      if (!isPaneBusyRefusal(started.error)) return started;

      const remainingBudgetMs = paneReadyTimeoutMs - waitedMs;
      if (remainingBudgetMs <= 0) {
        return err({
          kind: "remote",
          code: AGENT_PANE_BUSY_CODE,
          message: `${started.error.message} (waited ${waitedMs}ms for the pane's shell)`,
        });
      }
      if (attempt === 1) onWaitingForPane?.();
      const delayMs = Math.min(backoffMs, remainingBudgetMs);
      await sleep(delayMs);
      waitedMs += delayMs;
      backoffMs = Math.min(backoffMs * 2, PANE_READY_MAX_BACKOFF_MS);
    }
  };

  return ok({
    async openPane(cwd) {
      const created = await call("workspace.create", {
        cwd,
        focus: false,
      });
      if (isErr(created)) return created;
      const paneId = stringAt(created.value, "root_pane", "pane_id");
      return paneId === undefined
        ? err({
            kind: "transport",
            because: "workspace.create: no root_pane.pane_id in the result",
          })
        : ok({ id: paneId });
    },

    async startAgent(
      pane: Pane,
      kind: string,
      args: readonly string[],
      onWaitingForPane?: () => void,
      preferredId?: string,
    ) {
      if (!AGENT_KINDS.has(kind))
        return err({ kind: "unknown-agent-kind", agentKind: kind });

      const preferredIsCompliant =
        preferredId !== undefined && isCompliantAgentName(preferredId);
      const primary = preferredIsCompliant ? preferredId : generateAgentName();

      const first = await attemptStartAgent(
        primary,
        pane,
        kind,
        args,
        onWaitingForPane,
      );
      if (!isErr(first)) return first;
      if (
        !preferredIsCompliant ||
        first.error.kind !== "remote" ||
        first.error.code === AGENT_PANE_BUSY_CODE
      ) {
        return first;
      }
      return attemptStartAgent(
        generateAgentName(),
        pane,
        kind,
        args,
        onWaitingForPane,
      );
    },

    async reportIdentity(
      agent: Agent,
      graph: string,
      node: string,
      identity: AgentIdentity,
    ) {
      const reported = await call("pane.report_metadata", {
        pane_id: agent.pane.id,
        source: "interlock",
        tokens: { graph, node, session: identity.sessionId },
        title: `${graph}/${node}`,
      });
      return isErr(reported) ? reported : ok(undefined);
    },

    async prompt(agent: Agent, text: string) {
      const prompted = await call("agent.prompt", {
        target: agent.id,
        text,
      });
      return isErr(prompted) ? prompted : ok(undefined);
    },

    async waitUntil(
      agent: Agent,
      until: readonly AgentStatus[],
      timeoutMs: number,
    ) {
      const startedAtMs = Date.now();
      let lastStatus: AgentStatus = "unknown";

      for (;;) {
        const elapsedBeforeGetMs = Date.now() - startedAtMs;
        if (elapsedBeforeGetMs >= timeoutMs) {
          return err({ kind: "timeout", until, timeoutMs, status: lastStatus });
        }

        const got = await call("agent.get", { target: agent.id });
        if (isErr(got)) {
          if (got.error.kind !== "call-timeout") return got;
        } else {
          const status = stringAt(got.value, "agent", "agent_status");
          if (isAgentStatus(status)) {
            lastStatus = status;
            if (until.includes(status)) return ok(status);
          }
        }

        const remainingMs = timeoutMs - (Date.now() - startedAtMs);
        if (remainingMs <= 0) {
          return err({ kind: "timeout", until, timeoutMs, status: lastStatus });
        }

        const sliceMs = Math.min(waitSliceMs, remainingMs);
        const waited = await call(
          "agent.wait",
          { target: agent.id, until, timeout_ms: sliceMs },
          sliceMs + CALL_DEADLINE_MARGIN_MS,
        );
        if (isErr(waited)) {
          if (
            waited.error.kind !== "call-timeout" &&
            !isWaitSliceTimeout(waited.error)
          ) {
            return waited;
          }
        } else {
          const status = stringAt(waited.value, "agent", "agent_status");
          if (isAgentStatus(status)) {
            lastStatus = status;
            if (until.includes(status)) return ok(status);
          }
        }
      }
    },

    async read(agent: Agent) {
      const read = await call("agent.read", {
        target: agent.id,
        source: "recent",
      });
      if (isErr(read)) return read;
      const text = stringAt(read.value, "read", "text");
      return text === undefined
        ? err({
            kind: "transport",
            because: "agent.read: no read.text in the result",
          })
        : ok(text);
    },

    async sendKeys(agent: Agent, keys: readonly string[]) {
      const sent = await call("agent.send_keys", {
        target: agent.id,
        keys,
      });
      return isErr(sent) ? sent : ok(undefined);
    },

    async closePane(pane: Pane) {
      const closed = await call("pane.close", { pane_id: pane.id });
      return isErr(closed) ? closed : ok(undefined);
    },

    async reportedAgentStatus(query: AgentIdentityQuery) {
      const listed = await call("pane.list", { workspace_id: null });
      if (isErr(listed)) return listed;
      const panes = prop(listed.value, "panes");
      if (!Array.isArray(panes)) return ok(undefined);
      for (const pane of panes) {
        if (!isRecord(pane)) continue;
        const tokens = prop(pane, "tokens");
        if (!isRecord(tokens)) continue;
        const matches =
          prop(tokens, "graph") === query.graph &&
          prop(tokens, "node") === query.node &&
          prop(tokens, "session") === query.session;
        if (!matches) continue;
        const status = prop(pane, "agent_status");
        return ok(isAgentStatus(status) ? status : undefined);
      }
      return ok(undefined);
    },
  });
}
