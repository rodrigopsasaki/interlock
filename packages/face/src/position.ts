import { isOk } from "@phyxiusjs/fp";
import { type Gate, gate, type LedgerProjection, type Note, nodeKey, type Outcome } from "ledger";
import type { AgentStatus } from "./agentStatus.ts";
import { attemptsFor, liveOrLatestAttempt, type PositionAttempt } from "./attempts.ts";
import { criticalPath } from "./criticalPath.ts";
import type { GraphDocument, NodeDeclaration } from "./document.ts";
import { type Float, floatOf } from "./float.ts";
import { type ClearedHead, clearedHeadOf, type Landed, type LandedReader } from "./landed.ts";
import { attentionOf, lineOf, type PositionLine } from "./line.ts";
import { changedAtOf, type Moment, sinceAtOf } from "./moment.ts";
import { isLiveAttempt } from "./nodeRow.ts";
import { type PositionGate, positionGate } from "./positionGate.ts";
import type { NodeRole } from "./role.ts";
import { topologicalOrder } from "./topology.ts";
import { nodeWeight } from "./weight.ts";

export const POSITION_SHAPE = "position@v3";

export type ApprovalState = "approved" | "stale" | "not-approved";

export type NodeState =
  | { readonly kind: "outcome"; readonly outcome: Outcome }
  | { readonly kind: "ready" }
  | { readonly kind: "blocked"; readonly on: readonly string[] };

export interface PositionNode {
  readonly id: string;
  readonly role?: NodeRole;
  readonly acceptance?: string;
  readonly dependsOn: readonly string[];
  readonly state: NodeState;
  readonly gates: readonly PositionGate[];
  readonly attempts: readonly PositionAttempt[];
  readonly float: Float;
  readonly landed?: Landed;
  readonly notes: readonly Note[];
}

export interface Position {
  readonly interlock: typeof POSITION_SHAPE;
  readonly graph: string;
  readonly ask?: string;
  readonly approval: ApprovalState;
  readonly line: PositionLine;
  readonly nodes: readonly PositionNode[];
  readonly criticalPath: readonly string[];
  readonly done: boolean;
  readonly changedAt: Moment;
  readonly sinceAt: Moment;
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
    positionGate(declared.id, declared.kind, view?.gates.get(declared.id) ?? gate.pending()),
  );
}

function clearedHeadFor(
  graph: string,
  node: string,
  cleared: Extract<Outcome, { kind: "cleared" }>,
  projection: LedgerProjection,
): ClearedHead {
  const view = projection.nodes.get(nodeKey({ graph, id: node }));
  const clearing = [...projection.sessions.values()].find(
    (session) =>
      session.node.graph === graph &&
      session.node.id === node &&
      session.leaseGeneration === view?.outcomeSetAtGeneration,
  );
  return clearedHeadOf(cleared, clearing?.graphBaseSha);
}

function landedFor(
  graph: string,
  node: string,
  outcome: Outcome | undefined,
  projection: LedgerProjection,
  landedReader: LandedReader | undefined,
): Landed | undefined {
  if (outcome?.kind !== "cleared") return undefined;
  if (landedReader === undefined) {
    return { kind: "unknown", because: "this read was given no repository to read main from" };
  }
  return landedReader(clearedHeadFor(graph, node, outcome, projection));
}

export function clearedHeadsOf(
  document: GraphDocument,
  projection: LedgerProjection,
): readonly ClearedHead[] {
  return document.nodes.flatMap((declaration) => {
    const outcome = projection.nodes.get(
      nodeKey({ graph: document.id, id: declaration.id }),
    )?.outcome;
    return outcome?.kind === "cleared"
      ? [clearedHeadFor(document.id, declaration.id, outcome, projection)]
      : [];
  });
}

function latestAttemptNotes(
  attempts: readonly PositionAttempt[],
  projection: LedgerProjection,
): readonly Note[] {
  const latest = liveOrLatestAttempt(attempts, isLiveAttempt);
  return latest === undefined ? [] : (projection.sessions.get(latest.session)?.notes ?? []);
}

function isNodeDone(node: PositionNode): boolean {
  return (
    node.state.kind === "outcome" &&
    node.state.outcome.kind === "cleared" &&
    node.landed?.kind === "on-main"
  );
}

export function positionOf(
  document: GraphDocument,
  projection: LedgerProjection,
  contentHash: string,
  nowWallMs: number,
  agentStatusFor?: (session: string) => AgentStatus | undefined,
  landedReader?: LandedReader,
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

  const nodes = order.map((declaration): PositionNode => {
    const landed = landedFor(
      document.id,
      declaration.id,
      outcomeByNode.get(declaration.id),
      projection,
      landedReader,
    );
    const attempts = attemptsFor(
      document.id,
      declaration.id,
      projection,
      nowWallMs,
      agentStatusFor,
    );
    return {
      id: declaration.id,
      ...(declaration.role === undefined ? {} : { role: declaration.role }),
      ...(declaration.acceptance === undefined ? {} : { acceptance: declaration.acceptance }),
      dependsOn: declaration.dependsOn,
      state: nodeState(declaration, outcomeByNode),
      gates: nodeGates(declaration, projection, document.id),
      attempts,
      float: floats.get(declaration.id) ?? {
        kind: "unknown",
        because: `${declaration.id}: no outcome yet`,
      },
      ...(landed === undefined ? {} : { landed }),
      notes: latestAttemptNotes(attempts, projection),
    };
  });

  const graphNodeView = projection.nodes.get(nodeKey({ graph: document.id, id: document.id }));
  const approvalGate = graphNodeView?.gates.get("approved");
  const approval = approvalState(approvalGate, contentHash);
  const done = nodes.every(isNodeDone);
  const attention = attentionOf({ graph: document.id, approval, nodes, done });

  return {
    interlock: POSITION_SHAPE,
    graph: document.id,
    ...(document.ask === undefined ? {} : { ask: document.ask }),
    approval,
    line: lineOf(attention),
    nodes,
    criticalPath: criticalPath(order, (id) => {
      const weight = weightOf(id);
      return weight.kind === "measured" ? weight.ms : undefined;
    }),
    done,
    changedAt: changedAtOf(nodes),
    sinceAt: sinceAtOf(attention, nodes),
  };
}
