import type { Result } from "@phyxiusjs/fp";

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export interface Pane {
  readonly id: string;
}

export interface Agent {
  readonly id: string;
  readonly pane: Pane;
}

export interface AgentIdentity {
  readonly sessionId: string;
  readonly sessionPath?: string;
}

export type RuntimeRefusal =
  | { readonly kind: "no-socket"; readonly path: string }
  | { readonly kind: "unknown-agent-kind"; readonly agentKind: string }
  | {
      readonly kind: "timeout";
      readonly until: readonly AgentStatus[];
      readonly timeoutMs: number;
    }
  | { readonly kind: "transport"; readonly because: string };

export function explainRuntimeRefusal(refusal: RuntimeRefusal): string {
  switch (refusal.kind) {
    case "no-socket":
      return `${refusal.path}: no socket found; the runtime's server was not attached.`;
    case "unknown-agent-kind":
      return `"${refusal.agentKind}": not a kind this runtime's agent host accepts.`;
    case "timeout":
      return `timed out after ${refusal.timeoutMs}ms waiting for one of: ${refusal.until.join(", ")}.`;
    case "transport":
      return refusal.because;
  }
}

export interface Runtime {
  openPane(cwd: string): Promise<Result<Pane, RuntimeRefusal>>;
  startAgent(
    pane: Pane,
    kind: string,
    args: readonly string[],
  ): Promise<Result<Agent, RuntimeRefusal>>;
  reportIdentity(
    agent: Agent,
    label: string,
    identity: AgentIdentity,
  ): Promise<Result<void, RuntimeRefusal>>;
  prompt(agent: Agent, text: string): Promise<Result<void, RuntimeRefusal>>;
  waitUntil(
    agent: Agent,
    until: readonly AgentStatus[],
    timeoutMs: number,
  ): Promise<Result<AgentStatus, RuntimeRefusal>>;
  read(agent: Agent): Promise<Result<string, RuntimeRefusal>>;
  sendKeys(
    agent: Agent,
    keys: readonly string[],
  ): Promise<Result<void, RuntimeRefusal>>;
  closePane(pane: Pane): Promise<Result<void, RuntimeRefusal>>;
}
