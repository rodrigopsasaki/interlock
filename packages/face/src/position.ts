import { isOk } from "@phyxiusjs/fp";
import { type Gate, gate, type LedgerProjection, nodeKey, type Outcome } from "ledger";
import type { AgentStatus } from "./agentStatus.ts";
import { attemptsFor, type PositionAttempt } from "./attempts.ts";
import { criticalPath } from "./criticalPath.ts";
import type { GraphDocument, NodeDeclaration } from "./document.ts";
import { type Float, floatOf } from "./float.ts";
import { type PositionGate, positionGate } from "./positionGate.ts";
import { topologicalOrder } from "./topology.ts";
import { nodeWeight } from "./weight.ts";

export const POSITION_SHAPE = "position@v1";

export type ApprovalState = "approved" | "stale" | "not-approved";

export type NodeState =
  | { readonly kind: "outcome"; readonly outcome: Outcome }
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly on: readonly string[] };

export interface PositionNode {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly state: NodeState;
  readonly gates: readonly PositionGate[];
  readonly attempts: readonly PositionAttempt[];
  readonly float: Float;
}

export interface Position {
  readonly interlock: typeof POSITION_SHAPE;
  readonly graph: string;
  readonly approval: ApprovalState;
  readonly nodes: readonly PositionNode[];
  readonly criticalPath: readonly string[];
}

export function approvalState(current: Gate | undefined, contentHash: string): ApprovalState {
  if (current === undefined) return "not-approved";
  switch (current.kind) {
    case "satisfied":
    case "waived":
      return current.receipt.id === contentHash ? "approved" : "stale";
    default:
      return "not-approved";
  }
}

function nodeState(
  declaration: NodeDeclaration,
  outcomeByNode: ReadonlyMap<string, Outcome>,
): NodeState {
  const own = outcomeByNode.get(declaration.id);
  if (own !== undefined) return { kind: "outcome", outcome: own };
  const unmet = declaration.dependsOn.filter(
    (dependsOn) => outcomeByNode.get(dependsOn)?.kind !== "cleared",
  );
  return unmet.length === 0 ? { kind: "ready" } : { kind: "blocked", on: unmet };
}

function nodeGates(
  declaration: NodeDeclaration,
  projection: LedgerProjection,
  graphId: string,
): readonly PositionGate[] {
  const view = projection.nodes.get(nodeKey({ graph: graphId, id: declaration.id }));
  return declaration.gates.map((declared) =>
    positionGate(declared.id, view?.gates.get(declared.id) ?? gate.pending()),
  );
}

export function positionOf(
  document: GraphDocument,
  projection: LedgerProjection,
  contentHash: string,
  nowWallMs: number,
  agentStatusFor?: (session: string) => AgentStatus | undefined,
): Position {
  const ordered = topologicalOrder(document.nodes);
  const order = isOk(ordered) ? ordered.value : document.nodes;

  const outcomeByNode = new Map<string, Outcome>();
  for (const declaration of document.nodes) {
    const view = projection.nodes.get(nodeKey({ graph: document.id, id: declaration.id }));
    if (view?.outcome !== undefined) outcomeByNode.set(declaration.id, view.outcome);
  }

  const weightOf = (id: string) => nodeWeight(id, outcomeByNode.get(id));
  const floats = floatOf(order, weightOf);

  const nodes = order.map(
    (declaration): PositionNode => ({
      id: declaration.id,
      dependsOn: declaration.dependsOn,
      state: nodeState(declaration, outcomeByNode),
      gates: nodeGates(declaration, projection, document.id),
      attempts: attemptsFor(document.id, declaration.id, projection, nowWallMs, agentStatusFor),
      float: floats.get(declaration.id) ?? {
        kind: "unknown",
        because: `${declaration.id}: no outcome yet`,
      },
    }),
  );

  const graphNodeView = projection.nodes.get(nodeKey({ graph: document.id, id: document.id }));
  const approvalGate = graphNodeView?.gates.get("approved");

  return {
    interlock: POSITION_SHAPE,
    graph: document.id,
    approval: approvalState(approvalGate, contentHash),
    nodes,
    criticalPath: criticalPath(order, (id) => {
      const weight = weightOf(id);
      return weight.kind === "measured" ? weight.ms : undefined;
    }),
  };
}
