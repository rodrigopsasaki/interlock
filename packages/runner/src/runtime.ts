import { isErr, type Result } from "@phyxiusjs/fp";

export type AgentStatus = "idle" | "working" | "blocked" | "done" | "unknown";

export interface Pane {
  readonly id: string;
  readonly workspace?: string | undefined;
}

export interface Agent {
  readonly id: string;
  readonly pane: Pane;
}

export interface AgentIdentity {
  readonly sessionId: string;
  readonly sessionPath?: string;
}

export interface AgentIdentityQuery {
  readonly graph: string;
  readonly node: string;
  readonly session: string;
}

export type PaneFact =
  | { readonly state: "known"; readonly address: string }
  | { readonly state: "unknown"; readonly because: string };

export type LiveWork =
  | { readonly state: "live"; readonly because: string }
  | { readonly state: "none" }
  | { readonly state: "unknown"; readonly because: string };

export interface AgentObservation {
  readonly agentStatus: AgentStatus;
  readonly pane: PaneFact;
  liveWork(): Promise<LiveWork>;
}

export interface RuntimeObservation {
  attempt(query: AgentIdentityQuery): AgentObservation;
}

export function unobservedAttempt(because: string): AgentObservation {
  return {
    agentStatus: "unknown",
    pane: { state: "unknown", because },
    liveWork: () => Promise.resolve({ state: "unknown", because }),
  };
}

export const NO_OBSERVATION_CAPABILITY = "the runtime offers no bulk observation";

export async function observeRuntime(runtime: Runtime): Promise<RuntimeObservation> {
  if (runtime.observe === undefined) {
    return { attempt: () => unobservedAttempt(NO_OBSERVATION_CAPABILITY) };
  }
  const observed = await runtime.observe();
  if (isErr(observed)) {
    const because = `the runtime's observation failed: ${explainRuntimeRefusal(observed.error)}`;
    return { attempt: () => unobservedAttempt(because) };
  }
  return observed.value;
}

export type RuntimeRefusal =
  | { readonly kind: "no-socket"; readonly path: string }
  | { readonly kind: "not-ready"; readonly message: string }
  | { readonly kind: "unknown-agent-kind"; readonly agentKind: string }
  | {
      readonly kind: "timeout";
      readonly until: readonly AgentStatus[];
      readonly timeoutMs: number;
      readonly status: AgentStatus;
      readonly liveWork?: LiveWork;
    }
  | {
      readonly kind: "call-timeout";
      readonly method: string;
      readonly timeoutMs: number;
    }
  | { readonly kind: "remote"; readonly code: string; readonly message: string }
  | { readonly kind: "transport"; readonly because: string };

export function describeLiveWork(work: LiveWork): string {
  switch (work.state) {
    case "live":
      return `live: ${work.because}`;
    case "none":
      return "no live work";
    case "unknown":
      return `unknown: ${work.because}`;
  }
}

export function explainRuntimeRefusal(refusal: RuntimeRefusal): string {
  switch (refusal.kind) {
    case "no-socket":
      return `${refusal.path}: no socket found; the runtime's server was not attached.`;
    case "not-ready":
      return refusal.message;
    case "unknown-agent-kind":
      return `"${refusal.agentKind}": not a kind this runtime's agent host accepts.`;
    case "timeout":
      return refusal.liveWork === undefined || refusal.liveWork.state === "none"
        ? `timed out after ${refusal.timeoutMs}ms waiting for one of: ${refusal.until.join(", ")}.`
        : `timed out after ${refusal.timeoutMs}ms with the agent ${refusal.status} and its work not shown finished (${describeLiveWork(refusal.liveWork)}); not judged, and not claimed stopped.`;
    case "call-timeout":
      return `${refusal.method}: no response within ${refusal.timeoutMs}ms.`;
    case "remote":
      return `${refusal.code}: ${refusal.message}`;
    case "transport":
      return refusal.because;
  }
}

export interface Runtime {
  checkServer?(): Promise<Result<void, RuntimeRefusal>>;
  readonly paneEnvironment?: boolean;
  paneProcess?(
    pane: Pane,
  ): Promise<
    Result<
      { readonly state: "present"; readonly pid: number | undefined } | { readonly state: "gone" },
      RuntimeRefusal
    >
  >;
  openPane(
    cwd: string,
    env?: Readonly<Record<string, string>>,
  ): Promise<Result<Pane, RuntimeRefusal>>;
  startAgent(
    pane: Pane,
    kind: string,
    args: readonly string[],
    onWaitingForPane?: () => void,
    preferredId?: string,
  ): Promise<Result<Agent, RuntimeRefusal>>;
  reportIdentity(
    agent: Agent,
    graph: string,
    node: string,
    identity: AgentIdentity,
  ): Promise<Result<void, RuntimeRefusal>>;
  prompt(agent: Agent, text: string): Promise<Result<void, RuntimeRefusal>>;
  waitUntil(
    agent: Agent,
    until: readonly AgentStatus[],
    timeoutMs: number,
  ): Promise<Result<AgentStatus, RuntimeRefusal>>;
  read(agent: Agent): Promise<Result<string, RuntimeRefusal>>;
  sendKeys(agent: Agent, keys: readonly string[]): Promise<Result<void, RuntimeRefusal>>;
  sendPaneKeys(pane: Pane, keys: readonly string[]): Promise<Result<void, RuntimeRefusal>>;
  closePane(pane: Pane): Promise<Result<void, RuntimeRefusal>>;
  reportedAgentStatus?(
    query: AgentIdentityQuery,
  ): Promise<Result<AgentStatus | undefined, RuntimeRefusal>>;
  resolvePane?(query: AgentIdentityQuery): Promise<Result<Pane | undefined, RuntimeRefusal>>;
  resolveAgent?(query: AgentIdentityQuery): Promise<Result<Agent | undefined, RuntimeRefusal>>;
  focusPane?(pane: Pane): Promise<Result<void, RuntimeRefusal>>;
  observe?(): Promise<Result<RuntimeObservation, RuntimeRefusal>>;
}
