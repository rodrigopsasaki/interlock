import type { Outcome } from "ledger";
import { liveOrLatestAttempt, type PositionAttempt } from "./attempts.ts";
import type { Landed } from "./landed.ts";
import { latestObservedAt } from "./moment.ts";
import { isLiveAttempt } from "./nodeRow.ts";
import type { ApprovalState, PositionNode } from "./position.ts";
import type { PositionGate } from "./positionGate.ts";

export type PositionLine =
  | { readonly voice: "observed"; readonly text: string }
  | { readonly voice: "said"; readonly who: string; readonly text: string; readonly at: string };

type EndedOutcome = Exclude<Outcome["kind"], "held" | "cleared">;

export type Standing =
  | { readonly kind: "held"; readonly node: string; readonly gate?: string }
  | { readonly kind: "asking"; readonly node: string; readonly who: string }
  | {
      readonly kind: "approval";
      readonly graph: string;
      readonly approval: "stale" | "not-approved";
    }
  | { readonly kind: "person-gate"; readonly node: string; readonly gate: string }
  | { readonly kind: "ready"; readonly node: string }
  | {
      readonly kind: "working";
      readonly node: string;
      readonly who: string;
      readonly pending: number;
    }
  | { readonly kind: "waiting"; readonly node: string; readonly on: readonly string[] }
  | { readonly kind: "ended"; readonly node: string; readonly outcome: EndedOutcome }
  | { readonly kind: "cleared"; readonly node: string; readonly landed?: Landed }
  | { readonly kind: "done"; readonly graph: string };

export interface LineGraph {
  readonly graph: string;
  readonly approval: ApprovalState;
  readonly nodes: readonly PositionNode[];
  readonly done: boolean;
}

const HUMAN_GATE_KIND = "human";

function whoRuns(attempt: PositionAttempt): string {
  return attempt.runtime === "unknown" ? "unknown" : attempt.runtime.name;
}

function isGatePassed(entry: PositionGate): boolean {
  return entry.state.kind === "satisfied" || entry.state.kind === "waived";
}

function openPersonGate(gates: readonly PositionGate[]): PositionGate | undefined {
  const person = gates.find(
    (entry) => entry.kind === HUMAN_GATE_KIND && entry.state.kind === "pending",
  );
  if (person === undefined) return undefined;
  const othersPassed = gates.filter((entry) => entry.kind !== HUMAN_GATE_KIND).every(isGatePassed);
  return othersPassed ? person : undefined;
}

function outcomeStanding(node: PositionNode, outcome: Outcome): Standing {
  switch (outcome.kind) {
    case "held": {
      const blockedGate = node.gates.find((entry) => entry.state.kind === "blocked");
      return blockedGate === undefined
        ? { kind: "held", node: node.id }
        : { kind: "held", node: node.id, gate: blockedGate.id };
    }
    case "cleared":
      return {
        kind: "cleared",
        node: node.id,
        ...(node.landed === undefined ? {} : { landed: node.landed }),
      };
    default:
      return { kind: "ended", node: node.id, outcome: outcome.kind };
  }
}

function nodeStanding(node: PositionNode): Standing {
  const live = node.attempts.find(isLiveAttempt);
  const state = node.state;
  const settled = state.kind === "outcome" ? outcomeStanding(node, state.outcome) : undefined;
  if (settled?.kind === "held") return settled;
  if (live?.asking !== undefined) return { kind: "asking", node: node.id, who: whoRuns(live) };
  if (settled !== undefined) return settled;
  if (state.kind === "blocked") return { kind: "waiting", node: node.id, on: state.on };
  const person = openPersonGate(node.gates);
  if (person !== undefined) return { kind: "person-gate", node: node.id, gate: person.id };
  if (live !== undefined) {
    return {
      kind: "working",
      node: node.id,
      who: whoRuns(live),
      pending: node.gates.filter((entry) => entry.state.kind === "pending").length,
    };
  }
  return { kind: "ready", node: node.id };
}

function rank(standing: Standing): number {
  switch (standing.kind) {
    case "held":
      return 0;
    case "asking":
      return 1;
    case "approval":
    case "person-gate":
      return 2;
    case "ready":
      return 3;
    case "working":
      return 4;
    case "waiting":
      return 5;
    case "ended":
      return 6;
    case "cleared":
      return standing.landed?.kind === "on-main" ? 8 : 7;
    case "done":
      return 9;
  }
}

export interface Attention {
  readonly standing: Standing;
  readonly node?: PositionNode;
}

export function attentionOf(graph: LineGraph): Attention {
  if (graph.done) return { standing: { kind: "done", graph: graph.graph } };
  const ranked: Attention[] = graph.nodes.map((node) => ({ standing: nodeStanding(node), node }));
  if (graph.approval !== "approved") {
    ranked.push({
      standing: { kind: "approval", graph: graph.graph, approval: graph.approval },
    });
  }
  let first: Attention | undefined;
  for (const candidate of ranked) {
    if (first === undefined || rank(candidate.standing) < rank(first.standing)) first = candidate;
  }
  return first ?? { standing: { kind: "done", graph: graph.graph } };
}

function gatesPending(count: number): string {
  return count === 1 ? "1 gate pending" : `${count} gates pending`;
}

function landedWords(landed: Landed | undefined): string {
  switch (landed?.kind) {
    case "on-main":
      return "on main";
    case "not-on-main":
      return "not on main";
    case "reverted-on-main":
      return "reverted on main";
    case "partly-reverted-on-main":
      return "partly reverted on main";
    case "unknown":
    case undefined:
      return "on main unknown";
  }
}

export function observedText(standing: Standing): string {
  switch (standing.kind) {
    case "held":
      return standing.gate === undefined
        ? `${standing.node} held`
        : `${standing.node} held at gate ${standing.gate}`;
    case "asking":
      return `${standing.who} session blocked at ${standing.node}`;
    case "approval":
      return standing.approval === "stale"
        ? `human gate approved stale at ${standing.graph}`
        : `human gate approved pending at ${standing.graph}`;
    case "person-gate":
      return `human gate ${standing.gate} pending at ${standing.node}`;
    case "ready":
      return `${standing.node} ready`;
    case "working":
      return `${standing.who} working ${standing.node}, ${gatesPending(standing.pending)}`;
    case "waiting":
      return `${standing.node} blocked on ${standing.on.join(", ")}`;
    case "ended":
      return `${standing.node} ${standing.outcome}`;
    case "cleared":
      return `${standing.node} cleared, ${landedWords(standing.landed)}`;
    case "done":
      return "done";
  }
}

function saidLine(node: PositionNode): PositionLine | undefined {
  const attempt = liveOrLatestAttempt(node.attempts, isLiveAttempt);
  const said = attempt?.said;
  if (attempt === undefined || said === undefined) return undefined;
  const saidAt = Date.parse(said.at);
  if (!Number.isFinite(saidAt)) return undefined;
  const observedAt = latestObservedAt(attempt);
  if (observedAt !== undefined && saidAt <= observedAt) return undefined;
  return { voice: "said", who: whoRuns(attempt), text: said.text, at: said.at };
}

export function lineOf(attention: Attention): PositionLine {
  const said = attention.node === undefined ? undefined : saidLine(attention.node);
  return said ?? { voice: "observed", text: observedText(attention.standing) };
}

export function renderLine(line: PositionLine): string {
  return line.voice === "observed" ? line.text : `${line.who}: "${line.text}"`;
}
