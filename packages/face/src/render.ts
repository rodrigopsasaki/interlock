import { liveOrLatestAttempt } from "./attempts.ts";
import type { Float } from "./float.ts";
import { isLiveAttempt } from "./nodeRow.ts";
import type { ApprovalState, NodeState, Position, PositionNode } from "./position.ts";
import type { PositionGate, PositionGateState } from "./positionGate.ts";
import { renderSessionRuntime } from "./runtimeLine.ts";
import { renderSessionFacts } from "./sessionFacts.ts";

function renderApproval(approval: ApprovalState): string {
  switch (approval) {
    case "approved":
      return "approved";
    case "stale":
      return "stale";
    case "not-approved":
      return "not approved";
  }
}

function renderState(state: NodeState): string {
  switch (state.kind) {
    case "ready":
      return "ready";
    case "blocked":
      return `blocked on ${state.on.join(", ")}`;
    case "outcome":
      return state.outcome.kind === "held" ? `held: ${state.outcome.because}` : state.outcome.kind;
  }
}

function renderGateState(state: PositionGateState): string {
  switch (state.kind) {
    case "pending":
      return "pending";
    case "satisfied":
      return "satisfied";
    case "blocked":
      return `blocked (${state.because})`;
    case "waived":
      return `waived by ${state.authority}`;
    case "superseded":
      return `superseded by ${state.authority}`;
  }
}

function renderGates(gates: readonly PositionGate[]): string {
  if (gates.length === 0) return "gates: none declared";
  return `gates: ${gates.map((entry) => `${entry.id} ${renderGateState(entry.state)}`).join(", ")}`;
}

function renderNodeRuntime(node: PositionNode): string | undefined {
  const attempt = liveOrLatestAttempt(node.attempts, isLiveAttempt);
  return attempt === undefined ? undefined : `runtime: ${renderSessionRuntime(attempt.runtime)}`;
}

function renderNodeFacts(node: PositionNode): readonly string[] {
  const attempt = liveOrLatestAttempt(node.attempts, isLiveAttempt);
  return attempt === undefined ? [] : renderSessionFacts(attempt.facts).map((line) => `  ${line}`);
}

export function renderPosition(position: Position): string {
  const lines: string[] = [`graph ${position.graph} — ${renderApproval(position.approval)}`, ""];

  for (const node of position.nodes) {
    lines.push(`${node.id} — ${renderState(node.state)}`);
    lines.push(`  ${renderGates(node.gates)}`);
    const runtimeLine = renderNodeRuntime(node);
    if (runtimeLine !== undefined) lines.push(`  ${runtimeLine}`);
    lines.push(...renderNodeFacts(node));
    if (node.float.kind === "measured") {
      lines.push(`  ${renderFloat(node.float)}`);
    }
  }

  lines.push("");
  lines.push(
    position.criticalPath.length === 0
      ? "critical path: (none)"
      : `critical path: ${position.criticalPath.join(" -> ")}`,
  );

  return lines.join("\n");
}

function renderFloat(float: Extract<Float, { kind: "measured" }>): string {
  return `float: ${Math.round(float.ms)}ms`;
}
