import { isLiveAttempt, nodeRowsOf, type NodeRow } from "./nodeRow.ts";
import { HELP_TEXT } from "./helpText.ts";
import type { PositionAttempt } from "./attempts.ts";
import type { PlansEntry } from "./plansEntry.ts";
import type { Position, PositionNode } from "./position.ts";
import type { PositionGate, PositionGateState } from "./positionGate.ts";

function cursor(rowIndex: number, index: number): string {
  return rowIndex === index ? "> " : "  ";
}

function renderApproval(approval: PlansEntry["approval"]): string {
  switch (approval) {
    case "approved":
      return "approved";
    case "stale":
      return "stale";
    case "not-approved":
      return "not approved";
  }
}

export function renderPlansFrame(
  plans: readonly PlansEntry[],
  index: number,
): string {
  const lines = ["graphs", ""];
  if (plans.length === 0) {
    lines.push("  (no graphs under .interlock/graphs)");
    return lines.join("\n");
  }
  plans.forEach((entry, rowIndex) => {
    lines.push(
      `${cursor(rowIndex, index)}${entry.graph} — ${renderApproval(entry.approval)} — ${entry.cleared}/${entry.total} cleared — ${entry.liveSessions} live`,
    );
  });
  return lines.join("\n");
}

function renderNodeState(node: PositionNode): string {
  switch (node.state.kind) {
    case "ready":
      return "ready";
    case "blocked":
      return `blocked on ${node.state.on.join(", ")}`;
    case "outcome":
      return node.state.outcome.kind === "held"
        ? `held: ${node.state.outcome.because}`
        : node.state.outcome.kind;
  }
}

function latestIsLive(node: PositionNode): boolean {
  const latest = node.attempts[node.attempts.length - 1];
  return latest !== undefined && isLiveAttempt(latest);
}

function liveMarker(node: PositionNode): string {
  return latestIsLive(node) ? "● " : "  ";
}

export function renderGraphFrame(position: Position, index: number): string {
  const lines = [
    `graph ${position.graph} — ${renderApproval(position.approval)}`,
    "",
  ];
  position.nodes.forEach((node, rowIndex) => {
    lines.push(
      `${cursor(rowIndex, index)}${liveMarker(node)}${node.id} — ${renderNodeState(node)}`,
    );
    const gateLine =
      node.gates.length === 0
        ? "gates: none declared"
        : `gates: ${node.gates
            .map((entry) => `${entry.id} ${entry.state.kind}`)
            .join(", ")}`;
    lines.push(`      ${gateLine}`);
    if (node.float.kind === "measured") {
      lines.push(`      float: ${Math.round(node.float.ms)}ms`);
    }
  });
  lines.push("");
  lines.push(
    position.criticalPath.length === 0
      ? "critical path: (none)"
      : `critical path: ${position.criticalPath.join(" -> ")}`,
  );
  return lines.join("\n");
}

function renderGateStateText(state: PositionGateState): string {
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

function renderGateRow(gate: PositionGate): string {
  const receipt =
    gate.receipt === undefined ? "" : ` (receipt ${gate.receipt.id})`;
  return `${gate.id} — ${renderGateStateText(gate.state)}${receipt}`;
}

function renderAttemptRow(attempt: PositionAttempt): string {
  const outcome =
    attempt.outcome === undefined ? "no outcome yet" : attempt.outcome.kind;
  const lease = attempt.lease === undefined ? "no lease" : "live lease";
  const status = attempt.agentStatus ?? "unknown";
  return `${attempt.session} — outcome ${outcome}, ${lease}, agent ${status}`;
}

function indexed(
  rows: readonly NodeRow[],
): readonly { readonly row: NodeRow; readonly rowIndex: number }[] {
  return rows.map((row, rowIndex) => ({ row, rowIndex }));
}

export function renderNodeFrame(node: PositionNode, index: number): string {
  const rows = nodeRowsOf(node);
  const gateRows = indexed(rows).filter(({ row }) => row.kind === "gate");
  const attemptRows = indexed(rows).filter(({ row }) => row.kind === "attempt");

  const lines = [`${node.id} — ${renderNodeState(node)}`, "", "gates:"];
  if (gateRows.length === 0) lines.push("  (none declared)");
  for (const { row, rowIndex } of gateRows) {
    if (row.kind !== "gate") continue;
    lines.push(`${cursor(rowIndex, index)}${renderGateRow(row.gate)}`);
  }

  lines.push("", "attempts:");
  if (attemptRows.length === 0) lines.push("  (none)");
  for (const { row, rowIndex } of attemptRows) {
    if (row.kind !== "attempt") continue;
    lines.push(`${cursor(rowIndex, index)}${renderAttemptRow(row.attempt)}`);
  }
  return lines.join("\n");
}

export function renderHelpOverlay(): string {
  return HELP_TEXT;
}
