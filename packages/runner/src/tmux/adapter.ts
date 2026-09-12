import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type {
  Agent,
  AgentIdentity,
  AgentStatus,
  Pane,
  Runtime,
  RuntimeRefusal,
} from "../runtime.ts";

export type TmuxCommandRunner = (
  args: readonly string[],
) => Promise<Result<string, RuntimeRefusal>>;

export function defaultTmuxRunner(
  args: readonly string[],
): Promise<Result<string, RuntimeRefusal>> {
  return new Promise((resolve) => {
    execFile("tmux", [...args], (error, stdout) => {
      resolve(error === null ? ok(stdout) : err({ kind: "transport", because: error.message }));
    });
  });
}

// tmux cannot observe an agent's state, so waitUntil can only time out.
export function createTmuxRuntime(run: TmuxCommandRunner = defaultTmuxRunner): Runtime {
  return {
    async openPane(cwd: string) {
      const name = `interlock-${randomUUID()}`;
      const created = await run(["new-session", "-d", "-s", name, "-c", cwd]);
      return isErr(created) ? created : ok({ id: name });
    },

    async startAgent(pane: Pane, kind: string, args: readonly string[]) {
      const command = [kind, ...args].join(" ");
      const sent = await run(["send-keys", "-t", pane.id, command, "Enter"]);
      return isErr(sent) ? sent : ok({ id: pane.id, pane });
    },

    reportIdentity(_agent: Agent, _graph: string, _node: string, _identity: AgentIdentity) {
      return Promise.resolve(ok(undefined));
    },

    async prompt(agent: Agent, text: string) {
      const sent = await run(["send-keys", "-t", agent.pane.id, text, "Enter"]);
      return isErr(sent) ? sent : ok(undefined);
    },

    waitUntil(
      _agent: Agent,
      until: readonly AgentStatus[],
      timeoutMs: number,
    ): Promise<Result<AgentStatus, RuntimeRefusal>> {
      return Promise.resolve(err({ kind: "timeout", until, timeoutMs, status: "unknown" }));
    },

    async read(agent: Agent) {
      const captured = await run(["capture-pane", "-t", agent.pane.id, "-p"]);
      return captured;
    },

    async sendKeys(agent: Agent, keys: readonly string[]) {
      const sent = await run(["send-keys", "-t", agent.pane.id, ...keys]);
      return isErr(sent) ? sent : ok(undefined);
    },

    async closePane(pane: Pane) {
      const killed = await run(["kill-session", "-t", pane.id]);
      return isErr(killed) ? killed : ok(undefined);
    },
  };
}
