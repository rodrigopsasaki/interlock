import { existsSync, unlinkSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { isRecord, isString, prop } from "../../src/validate.ts";

export interface RecordedCall {
  readonly method: string;
  readonly params: Record<string, unknown>;
}

export interface FakeHerdrServer {
  readonly socketPath: string;
  readonly calls: readonly RecordedCall[];
  agentStatus: string;
  failNextCall(code: string, message: string): void;
  withholdNextCall(): void;
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

export function startFakeHerdrServer(
  socketPath: string,
): Promise<FakeHerdrServer> {
  if (existsSync(socketPath)) unlinkSync(socketPath);

  const calls: RecordedCall[] = [];
  const state = { agentStatus: "idle" };
  const sockets = new Set<Socket>();
  let nextFailure: { code: string; message: string } | undefined;
  let withholdNext = false;

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

    if (withholdNext) {
      withholdNext = false;
      return;
    }
    if (nextFailure !== undefined) {
      const { code, message } = nextFailure;
      nextFailure = undefined;
      fail(socket, id, code, message);
      return;
    }

    switch (method) {
      case "workspace.create":
        respond(socket, id, { root_pane: panePayload("fake-pane-1") });
        return;
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
      case "pane.report_agent":
      case "pane.report_agent_session":
      case "pane.close":
      case "agent.prompt":
      case "agent.send_keys":
        respond(socket, id, {});
        return;
      case "agent.wait":
        respond(socket, id, { agent: { agent_status: state.agentStatus } });
        return;
      case "agent.read":
        respond(socket, id, { read: { text: "fake agent output" } });
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
        failNextCall(code, message) {
          nextFailure = { code, message };
        },
        withholdNextCall() {
          withholdNext = true;
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
