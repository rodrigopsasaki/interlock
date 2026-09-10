import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type {
  Agent,
  AgentIdentity,
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

interface HerdrClient {
  call(
    method: string,
    params: Readonly<Record<string, unknown>>,
    timeoutMs?: number,
  ): Promise<Result<Record<string, unknown>, RuntimeRefusal>>;
  close(): void;
}

function connectHerdr(
  socketPath: string,
  defaultCallTimeoutMs: number,
): Promise<Result<HerdrClient, RuntimeRefusal>> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    const pending = new Map<string, (frame: RpcSuccess | RpcFailure) => void>();
    let buffer = "";

    socket.once("error", () => {
      resolve(err({ kind: "no-socket", path: socketPath }));
    });

    socket.once("connect", () => {
      socket.removeAllListeners("error");
      socket.on("error", () => undefined);
      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf-8");
        let boundary = buffer.indexOf("\n");
        while (boundary !== -1) {
          const line = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 1);
          const frame = line.trim().length === 0 ? undefined : parseFrame(line);
          if (frame !== undefined) pending.get(frame.id)?.(frame);
          if (frame !== undefined) pending.delete(frame.id);
          boundary = buffer.indexOf("\n");
        }
      });

      resolve(
        ok({
          call(method, params, timeoutMs = defaultCallTimeoutMs) {
            return new Promise((resolveCall) => {
              const id = randomUUID();
              const deadline = setTimeout(() => {
                pending.delete(id);
                resolveCall(err({ kind: "call-timeout", method, timeoutMs }));
              }, timeoutMs);
              pending.set(id, (frame) => {
                clearTimeout(deadline);
                resolveCall(
                  "error" in frame
                    ? err({
                        kind: "remote",
                        code: frame.error.code,
                        message: frame.error.message,
                      })
                    : ok(frame.result),
                );
              });
              socket.write(`${JSON.stringify({ id, method, params })}\n`);
            });
          },
          close() {
            socket.end();
          },
        }),
      );
    });
  });
}

export async function createHerdrRuntime(
  socketPath: string = defaultHerdrSocketPath(),
  defaultCallTimeoutMs: number = DEFAULT_CALL_TIMEOUT_MS,
): Promise<Result<Runtime, RuntimeRefusal>> {
  const connected = await connectHerdr(socketPath, defaultCallTimeoutMs);
  if (isErr(connected)) return connected;
  const client = connected.value;

  return ok({
    async openPane(cwd) {
      const created = await client.call("workspace.create", {
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

    async startAgent(pane: Pane, kind: string, args: readonly string[]) {
      if (!AGENT_KINDS.has(kind))
        return err({ kind: "unknown-agent-kind", agentKind: kind });
      const name = generateAgentName();
      const started = await client.call(
        "agent.start",
        {
          name,
          kind,
          pane_id: pane.id,
          args,
          timeout_ms: AGENT_START_TIMEOUT_MS,
        },
        AGENT_START_TIMEOUT_MS + CALL_DEADLINE_MARGIN_MS,
      );
      return isErr(started) ? started : ok({ id: name, pane });
    },

    async reportIdentity(agent: Agent, label: string, identity: AgentIdentity) {
      const reportedAgent = await client.call("pane.report_agent", {
        pane_id: agent.pane.id,
        source: "interlock",
        agent: label,
        state: "working",
      });
      if (isErr(reportedAgent)) return reportedAgent;
      const reportedSession = await client.call("pane.report_agent_session", {
        pane_id: agent.pane.id,
        source: "interlock",
        agent: label,
        agent_session_id: identity.sessionId,
        ...(identity.sessionPath === undefined
          ? {}
          : { agent_session_path: identity.sessionPath }),
      });
      return isErr(reportedSession) ? reportedSession : ok(undefined);
    },

    async prompt(agent: Agent, text: string) {
      const prompted = await client.call("agent.prompt", {
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
      const waited = await client.call(
        "agent.wait",
        { target: agent.id, until, timeout_ms: timeoutMs },
        timeoutMs + CALL_DEADLINE_MARGIN_MS,
      );
      if (isErr(waited)) return waited;
      const status = stringAt(waited.value, "agent", "agent_status");
      return isAgentStatus(status) && until.includes(status)
        ? ok(status)
        : err({ kind: "timeout", until, timeoutMs });
    },

    async read(agent: Agent) {
      const read = await client.call("agent.read", {
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
      const sent = await client.call("agent.send_keys", {
        target: agent.id,
        keys,
      });
      return isErr(sent) ? sent : ok(undefined);
    },

    async closePane(pane: Pane) {
      const closed = await client.call("pane.close", { pane_id: pane.id });
      return isErr(closed) ? closed : ok(undefined);
    },
  });
}
