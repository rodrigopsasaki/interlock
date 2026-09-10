import { isOk } from "@phyxiusjs/fp";
import {
  gate,
  nodeKey,
  type Gate,
  type LedgerProjection,
  type Outcome,
} from "ledger";
import { criticalPath } from "./criticalPath.ts";
import type { GraphDocument, NodeDeclaration } from "./document.ts";
import { topologicalOrder } from "./topology.ts";

export type ApprovalState = "approved" | "stale" | "not-approved";

export type NodeState =
  | { readonly kind: "outcome"; readonly outcome: Outcome }
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly on: readonly string[] };

export interface PositionGate {
  readonly id: string;
  readonly gate: Gate;
}

export interface PositionNode {
  readonly id: string;
  readonly dependsOn: readonly string[];
  readonly state: NodeState;
  readonly gates: readonly PositionGate[];
}

export interface Position {
  readonly graph: string;
  readonly approval: ApprovalState;
  readonly nodes: readonly PositionNode[];
  readonly criticalPath: readonly string[];
}

export function approvalState(
  current: Gate | undefined,
  contentHash: string,
): ApprovalState {
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
  return unmet.length === 0
    ? { kind: "ready" }
    : { kind: "blocked", on: unmet };
}

function nodeGates(
  declaration: NodeDeclaration,
  projection: LedgerProjection,
  graphId: string,
): readonly PositionGate[] {
  const view = projection.nodes.get(
    nodeKey({ graph: graphId, id: declaration.id }),
  );
  return declaration.gates.map((declared) => ({
    id: declared.id,
    gate: view?.gates.get(declared.id) ?? gate.pending(),
  }));
}

export function computePosition(
  document: GraphDocument,
  projection: LedgerProjection,
  contentHash: string,
): Position {
  const ordered = topologicalOrder(document.nodes);
  const order = isOk(ordered) ? ordered.value : document.nodes;

  const outcomeByNode = new Map<string, Outcome>();
  for (const declaration of document.nodes) {
    const view = projection.nodes.get(
      nodeKey({ graph: document.id, id: declaration.id }),
    );
    if (view?.outcome !== undefined)
      outcomeByNode.set(declaration.id, view.outcome);
  }

  const nodes = order.map(
    (declaration): PositionNode => ({
      id: declaration.id,
      dependsOn: declaration.dependsOn,
      state: nodeState(declaration, outcomeByNode),
      gates: nodeGates(declaration, projection, document.id),
    }),
  );

  const graphNodeView = projection.nodes.get(
    nodeKey({ graph: document.id, id: document.id }),
  );
  const approvalGate = graphNodeView?.gates.get("approved");

  return {
    graph: document.id,
    approval: approvalState(approvalGate, contentHash),
    nodes,
    criticalPath: criticalPath(order),
  };
}
