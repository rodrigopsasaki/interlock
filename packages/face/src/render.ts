import type { Float } from "./float.ts";
import type { ApprovalState, NodeState, Position } from "./position.ts";
import type { PositionGate, PositionGateState } from "./positionGate.ts";

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

export function renderPosition(position: Position): string {
  const lines: string[] = [`graph ${position.graph} — ${renderApproval(position.approval)}`, ""];

  for (const node of position.nodes) {
    lines.push(`${node.id} — ${renderState(node.state)}`);
    lines.push(`  ${renderGates(node.gates)}`);
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
