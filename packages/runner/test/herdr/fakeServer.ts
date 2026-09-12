import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { isRecord, isString, prop } from "../../src/validate.ts";

export interface RecordedCall {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface FakeWorkspaceTabState {
  readonly tab_id: string;
  readonly paneCount: number;
}

export interface FakeWorkspaceState {
  readonly workspace_id: string;
  readonly label: string | null;
  readonly tabs: readonly FakeWorkspaceTabState[];
}

export interface FakeHerdrServer {
  readonly socketPath: string;
  readonly calls: readonly RecordedCall[];
  agentStatus: string;
  delayAgentWaitToRequestedTimeout: boolean;
  panes: readonly Record<string, unknown>[];
  workspaces: readonly FakeWorkspaceState[];
  failNextCall(
    code: string,
    message: string,
    times?: number,
    method?: string,
  ): void;
  withholdNextCall(method?: string): void;
  close(): Promise<void>;
}

// Mirrors herdr's own rule: one request per connection, socket closed once its response is
// written.
function respond(
  socket: Socket,
  id: string,
  result: Record<string, unknown>,
): void {
  socket.write(`${JSON.stringify({ id, result })}\n`, () => socket.end());
}

function fail(socket: Socket, id: string, code: string, message: string): void {
  socket.write(`${JSON.stringify({ id, error: { code, message } })}\n`, () =>
    socket.end(),
  );
}

function matchesPending(
  pendingMethod: string | undefined,
  incomingMethod: string,
): boolean {
  return pendingMethod === undefined || pendingMethod === incomingMethod;
}

function panePayload(paneId: string): Record<string, unknown> {
  return {
    pane_id: paneId,
    terminal_id: "fake-terminal",
    workspace_id: "fake-workspace",
    tab_id: "fake-tab",
    focused: true,
    agent_status: "unknown",
    revision: 1,
  };
}

interface Tab {
  readonly tabId: string;
  paneCount: number;
}

interface Workspace {
  readonly workspaceId: string;
  label: string | null;
  readonly tabs: Map<string, Tab>;
}

function workspaceInfo(workspace: Workspace): Record<string, unknown> {
  const tabs = [...workspace.tabs.values()];
  return {
    workspace_id: workspace.workspaceId,
    label: workspace.label,
    number: 0,
    focused: false,
    pane_count: tabs.reduce((sum, tab) => sum + tab.paneCount, 0),
    tab_count: tabs.length,
    active_tab_id: tabs[0]?.tabId ?? "",
    agent_status: "unknown",
  };
}

function tabInfo(workspace: Workspace, tab: Tab): Record<string, unknown> {
  return {
    tab_id: tab.tabId,
    workspace_id: workspace.workspaceId,
    number: 0,
    label: "",
    focused: false,
    pane_count: tab.paneCount,
    agent_status: "unknown",
  };
}

function tabPanePayload(
  paneId: string,
  workspace: Workspace,
  tab: Tab,
): Record<string, unknown> {
  return {
    pane_id: paneId,
    terminal_id: "fake-terminal",
    workspace_id: workspace.workspaceId,
    tab_id: tab.tabId,
    focused: true,
    agent_status: "unknown",
    revision: 1,
  };
}

export function startFakeHerdrServer(
  socketPath: string,
): Promise<FakeHerdrServer> {
  if (existsSync(socketPath)) unlinkSync(socketPath);

  const calls: RecordedCall[] = [];
  const state = {
    agentStatus: "idle",
    delayAgentWaitToRequestedTimeout: false,
    panes: [] as readonly Record<string, unknown>[],
  };
  const workspaces = new Map<string, Workspace>();
  const paneTabs = new Map<string, { workspaceId: string; tabId: string }>();
  let nextSeq = { workspace: 0, tab: 0, pane: 0 };
  const nextId = (kind: "workspace" | "tab" | "pane"): string => {
    nextSeq = { ...nextSeq, [kind]: nextSeq[kind] + 1 };
    return `fake-${kind}-${nextSeq[kind]}`;
  };
  const findTab = (
    tabId: unknown,
  ): { workspace: Workspace; tab: Tab } | undefined => {
    if (!isString(tabId)) return undefined;
    for (const workspace of workspaces.values()) {
      const tab = workspace.tabs.get(tabId);
      if (tab !== undefined) return { workspace, tab };
    }
    return undefined;
  };

  const sockets = new Set<Socket>();
  let nextFailure:
    | {
        code: string;
        message: string;
        remaining: number;
        method: string | undefined;
      }
    | undefined;
  let withhold: { method: string | undefined } | undefined;

  const server: Server = createServer((socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf-8");
      let boundary = buffer.indexOf("\n");
      while (boundary !== -1) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        if (line.trim().length > 0) handleLine(socket, line);
        boundary = buffer.indexOf("\n");
      }
    });
  });

  function handleLine(socket: Socket, line: string): void {
    const parsed: unknown = JSON.parse(line);
    if (!isRecord(parsed)) return;
    const id = prop(parsed, "id");
    const method = prop(parsed, "method");
    const params = prop(parsed, "params");
    if (!isString(id) || !isString(method) || !isRecord(params)) return;
    calls.push({ method, params });

    if (withhold !== undefined && matchesPending(withhold.method, method)) {
      withhold = undefined;
      return;
    }
    if (
      nextFailure !== undefined &&
      matchesPending(nextFailure.method, method)
    ) {
      const { code, message } = nextFailure;
      nextFailure =
        nextFailure.remaining > 1
          ? { ...nextFailure, remaining: nextFailure.remaining - 1 }
          : undefined;
      fail(socket, id, code, message);
      return;
    }

    switch (method) {
      case "workspace.create": {
        const label = prop(params, "label");
        const workspace: Workspace = {
          workspaceId: nextId("workspace"),
          label: isString(label) ? label : null,
          tabs: new Map(),
        };
        const tab: Tab = { tabId: nextId("tab"), paneCount: 1 };
        workspace.tabs.set(tab.tabId, tab);
        workspaces.set(workspace.workspaceId, workspace);
        const paneId = nextId("pane");
        paneTabs.set(paneId, {
          workspaceId: workspace.workspaceId,
          tabId: tab.tabId,
        });
        respond(socket, id, {
          workspace: workspaceInfo(workspace),
          tab: tabInfo(workspace, tab),
          root_pane: tabPanePayload(paneId, workspace, tab),
        });
        return;
      }
      case "workspace.list": {
        respond(socket, id, {
          workspaces: [...workspaces.values()].map(workspaceInfo),
        });
        return;
      }
      case "tab.create": {
        const workspaceId = prop(params, "workspace_id");
        const workspace = isString(workspaceId)
          ? workspaces.get(workspaceId)
          : undefined;
        if (workspace === undefined) {
          fail(
            socket,
            id,
            "workspace_not_found",
            `no such workspace "${String(workspaceId)}"`,
          );
          return;
        }
        const tab: Tab = { tabId: nextId("tab"), paneCount: 1 };
        workspace.tabs.set(tab.tabId, tab);
        const paneId = nextId("pane");
        paneTabs.set(paneId, {
          workspaceId: workspace.workspaceId,
          tabId: tab.tabId,
        });
        respond(socket, id, {
          tab: tabInfo(workspace, tab),
          root_pane: tabPanePayload(paneId, workspace, tab),
        });
        return;
      }
      case "tab.get": {
        const found = findTab(prop(params, "tab_id"));
        if (found === undefined) {
          fail(
            socket,
            id,
            "tab_not_found",
            `no such tab "${String(prop(params, "tab_id"))}"`,
          );
          return;
        }
        respond(socket, id, { tab: tabInfo(found.workspace, found.tab) });
        return;
      }
      case "tab.close": {
        const found = findTab(prop(params, "tab_id"));
        if (found !== undefined) {
          found.workspace.tabs.delete(found.tab.tabId);
        }
        respond(socket, id, {});
        return;
      }
      case "agent.start": {
        const name = prop(params, "name");
        respond(socket, id, {
          agent: {
            ...panePayload("fake-pane-1"),
            name: isString(name) ? name : "fake-agent",
          },
          argv: [],
        });
        return;
      }
      case "pane.close": {
        const paneId = prop(params, "pane_id");
        if (isString(paneId)) {
          const located = paneTabs.get(paneId);
          if (located !== undefined) {
            const workspace = workspaces.get(located.workspaceId);
            const tab = workspace?.tabs.get(located.tabId);
            if (tab !== undefined) {
              tab.paneCount = Math.max(0, tab.paneCount - 1);
            }
            paneTabs.delete(paneId);
          }
        }
        respond(socket, id, {});
        return;
      }
      case "pane.report_metadata":
      case "agent.prompt":
      case "agent.send_keys":
        respond(socket, id, {});
        return;
      case "agent.get":
        respond(socket, id, { agent: { agent_status: state.agentStatus } });
        return;
      case "agent.wait": {
        if (!state.delayAgentWaitToRequestedTimeout) {
          respond(socket, id, { agent: { agent_status: state.agentStatus } });
          return;
        }
        // Real herdr answers an agent.wait whose timeout_ms elapsed before the status changed
        // with this exact error, never a status payload: the fake exists to be herdr.
        const requestedTimeoutMs = prop(params, "timeout_ms");
        setTimeout(
          () =>
            fail(socket, id, "timeout", "timed out waiting for agent status"),
          typeof requestedTimeoutMs === "number" ? requestedTimeoutMs : 0,
        );
        return;
      }
      case "agent.read":
        respond(socket, id, { read: { text: "fake agent output" } });
        return;
      case "pane.list":
        respond(socket, id, { panes: state.panes });
        return;
      case "agent.list":
        respond(socket, id, { agents: state.panes });
        return;
      case "pane.focus":
        respond(socket, id, {});
        return;
      default:
        fail(
          socket,
          id,
          "unhandled",
          `fake herdr server does not implement "${method}"`,
        );
    }
  }

  return new Promise((resolve) => {
    server.listen(socketPath, () => {
      resolve({
        socketPath,
        calls,
        get agentStatus() {
          return state.agentStatus;
        },
        set agentStatus(value: string) {
          state.agentStatus = value;
        },
        get delayAgentWaitToRequestedTimeout() {
          return state.delayAgentWaitToRequestedTimeout;
        },
        set delayAgentWaitToRequestedTimeout(value: boolean) {
          state.delayAgentWaitToRequestedTimeout = value;
        },
        get panes() {
          return state.panes;
        },
        set panes(value: readonly Record<string, unknown>[]) {
          state.panes = value;
        },
        get workspaces(): readonly FakeWorkspaceState[] {
          return [...workspaces.values()].map((workspace) => ({
            workspace_id: workspace.workspaceId,
            label: workspace.label,
            tabs: [...workspace.tabs.values()].map((tab) => ({
              tab_id: tab.tabId,
              paneCount: tab.paneCount,
            })),
          }));
        },
        set workspaces(value: readonly FakeWorkspaceState[]) {
          workspaces.clear();
          paneTabs.clear();
          for (const entry of value) {
            const tabs = new Map<string, Tab>(
              entry.tabs.map((tab) => [
                tab.tab_id,
                { tabId: tab.tab_id, paneCount: tab.paneCount },
              ]),
            );
            workspaces.set(entry.workspace_id, {
              workspaceId: entry.workspace_id,
              label: entry.label,
              tabs,
            });
          }
        },
        failNextCall(code, message, times = 1, method = undefined) {
          nextFailure = { code, message, remaining: times, method };
        },
        withholdNextCall(method = undefined) {
          withhold = { method };
        },
        close() {
          for (const socket of sockets) socket.destroy();
          return new Promise((resolveClose) =>
            server.close(() => resolveClose()),
          );
        },
      });
    });
  });
}
