import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { connect } from "node:net";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
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
import { isRecord, isString, numberAt, prop, stringAt } from "../validate.ts";

export function defaultHerdrSocketPath(): string {
  return join(homedir(), ".config", "herdr", "herdr.sock");
}

export function repositoryLabel(cwd: string): string {
  try {
    const commonDir = execFileSync(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd, encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return basename(dirname(commonDir));
  } catch {
    return basename(cwd);
  }
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
  return refusal.kind === "remote" && refusal.code === AGENT_WAIT_SLICE_TIMEOUT_CODE;
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
    throw new Error(`generateAgentName produced a name herdr would reject: "${name}"`);
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

type HerdrCall = (
  method: string,
  params: Readonly<Record<string, unknown>>,
  timeoutMs?: number,
) => Promise<Result<Record<string, unknown>, RuntimeRefusal>>;

async function findReportedAgent(
  call: HerdrCall,
  query: AgentIdentityQuery,
): Promise<Result<Record<string, unknown> | undefined, RuntimeRefusal>> {
  const listed = await call("agent.list", {});
  if (isErr(listed)) return listed;
  const agents = prop(listed.value, "agents");
  if (!Array.isArray(agents)) return ok(undefined);
  for (const agent of agents) {
    if (!isRecord(agent)) continue;
    const tokens = prop(agent, "tokens");
    if (!isRecord(tokens)) continue;
    const matches =
      prop(tokens, "graph") === query.graph &&
      prop(tokens, "node") === query.node &&
      prop(tokens, "session") === query.session;
    if (matches) return ok(agent);
  }
  return ok(undefined);
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

    const settle = (result: Result<Record<string, unknown>, RuntimeRefusal>) => {
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
function verifyHerdrSocket(socketPath: string): Promise<Result<void, RuntimeRefusal>> {
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

  const paneTabs = new Map<string, string>();

  const paneFromCreated = (
    result: Record<string, unknown>,
    method: string,
  ): Result<Pane, RuntimeRefusal> => {
    const paneId = stringAt(result, "root_pane", "pane_id");
    const tabId = stringAt(result, "tab", "tab_id");
    if (paneId === undefined || tabId === undefined) {
      return err({
        kind: "transport",
        because: `${method}: no root_pane.pane_id or tab.tab_id in the result`,
      });
    }
    paneTabs.set(paneId, tabId);
    return ok({ id: paneId });
  };

  return ok({
    async openPane(cwd) {
      const label = repositoryLabel(cwd);
      const listed = await call("workspace.list", {});
      if (isErr(listed)) return listed;
      const workspaces = prop(listed.value, "workspaces");
      const existing = Array.isArray(workspaces)
        ? workspaces.find((workspace) => isRecord(workspace) && prop(workspace, "label") === label)
        : undefined;

      if (isRecord(existing)) {
        const workspaceId = stringAt(existing, "workspace_id");
        if (workspaceId === undefined) {
          return err({
            kind: "transport",
            because: "workspace.list: a matching workspace has no workspace_id",
          });
        }
        const opened = await call("tab.create", {
          workspace_id: workspaceId,
          cwd,
          focus: false,
        });
        return isErr(opened) ? opened : paneFromCreated(opened.value, "tab.create");
      }

      const created = await call("workspace.create", {
        cwd,
        focus: false,
        label,
      });
      return isErr(created) ? created : paneFromCreated(created.value, "workspace.create");
    },

    async startAgent(
      pane: Pane,
      kind: string,
      args: readonly string[],
      onWaitingForPane?: () => void,
      preferredId?: string,
    ) {
      if (!AGENT_KINDS.has(kind)) return err({ kind: "unknown-agent-kind", agentKind: kind });

      const preferredIsCompliant = preferredId !== undefined && isCompliantAgentName(preferredId);
      const primary = preferredIsCompliant ? preferredId : generateAgentName();

      const first = await attemptStartAgent(primary, pane, kind, args, onWaitingForPane);
      if (!isErr(first)) return first;
      if (
        !preferredIsCompliant ||
        first.error.kind !== "remote" ||
        first.error.code === AGENT_PANE_BUSY_CODE
      ) {
        return first;
      }
      return attemptStartAgent(generateAgentName(), pane, kind, args, onWaitingForPane);
    },

    async reportIdentity(agent: Agent, graph: string, node: string, identity: AgentIdentity) {
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

    async waitUntil(agent: Agent, until: readonly AgentStatus[], timeoutMs: number) {
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
          if (waited.error.kind !== "call-timeout" && !isWaitSliceTimeout(waited.error)) {
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
      if (isErr(closed)) return closed;

      const tabId = paneTabs.get(pane.id);
      paneTabs.delete(pane.id);
      if (tabId === undefined) return ok(undefined);

      const tab = await call("tab.get", { tab_id: tabId });
      if (isErr(tab)) return ok(undefined);
      if (numberAt(tab.value, "tab", "pane_count") === 0) {
        await call("tab.close", { tab_id: tabId });
      }
      return ok(undefined);
    },

    async reportedAgentStatus(query: AgentIdentityQuery) {
      const found = await findReportedAgent(call, query);
      if (isErr(found)) return found;
      if (found.value === undefined) return ok(undefined);
      const status = prop(found.value, "agent_status");
      return ok(isAgentStatus(status) ? status : undefined);
    },

    async resolvePane(query: AgentIdentityQuery) {
      const found = await findReportedAgent(call, query);
      if (isErr(found)) return found;
      if (found.value === undefined) return ok(undefined);
      const paneId = prop(found.value, "pane_id");
      return ok(isString(paneId) ? { id: paneId } : undefined);
    },

    async focusPane(pane: Pane) {
      const focused = await call("pane.focus", { pane_id: pane.id });
      return isErr(focused) ? focused : ok(undefined);
    },
  });
}
