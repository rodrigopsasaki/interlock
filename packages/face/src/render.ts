import type { Gate } from "ledger";
import type {
  ApprovalState,
  NodeState,
  Position,
  PositionGate,
} from "./position.ts";

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
      return state.outcome.kind;
  }
}

function renderGateState(value: Gate): string {
  switch (value.kind) {
    case "pending":
      return "pending";
    case "satisfied":
      return "satisfied";
    case "blocked":
      return `blocked (${value.because})`;
    case "waived":
      return `waived by ${value.authority}`;
    case "superseded":
      return `superseded by ${value.authority}`;
  }
}

function renderGates(gates: readonly PositionGate[]): string {
  if (gates.length === 0) return "gates: none declared";
  return `gates: ${gates.map((entry) => `${entry.id} ${renderGateState(entry.gate)}`).join(", ")}`;
}

export function renderPosition(position: Position): string {
  const lines: string[] = [
    `graph ${position.graph} — ${renderApproval(position.approval)}`,
    "",
  ];

  for (const node of position.nodes) {
    lines.push(`${node.id} — ${renderState(node.state)}`);
    lines.push(`  ${renderGates(node.gates)}`);
  }

  lines.push("");
  lines.push(
    position.criticalPath.length === 0
      ? "critical path: (none)"
      : `critical path: ${position.criticalPath.join(" -> ")}`,
  );

  return lines.join("\n");
}
