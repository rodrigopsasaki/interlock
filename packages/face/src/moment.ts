import { liveOrLatestAttempt, type PositionAttempt } from "./attempts.ts";
import type { Attention } from "./line.ts";
import { isLiveAttempt } from "./nodeRow.ts";
import type { PositionNode } from "./position.ts";

export type JournalFact = "session-narrated" | "note-appended" | "person-said";

export type Moment =
  | { readonly kind: "known"; readonly at: number; readonly fact: JournalFact }
  | { readonly kind: "unknown"; readonly because: string };

interface Stamp {
  readonly at: number;
  readonly fact: JournalFact;
}

function heardStamps(attempt: PositionAttempt): readonly Stamp[] {
  return attempt.heard === undefined ? [] : [{ at: attempt.heard.at, fact: "person-said" }];
}

function observedStamps(attempt: PositionAttempt): readonly Stamp[] {
  return [
    ...attempt.runner.map((step): Stamp => ({ at: step.at, fact: "session-narrated" })),
    ...heardStamps(attempt),
  ];
}

function saidStamps(attempt: PositionAttempt): readonly Stamp[] {
  const at = attempt.said === undefined ? Number.NaN : Date.parse(attempt.said.at);
  return Number.isFinite(at) ? [{ at, fact: "note-appended" }] : [];
}

function latest(stamps: readonly Stamp[]): Stamp | undefined {
  let found: Stamp | undefined;
  for (const stamp of stamps) if (found === undefined || stamp.at > found.at) found = stamp;
  return found;
}

export function latestObservedAt(attempt: PositionAttempt): number | undefined {
  return latest(observedStamps(attempt))?.at;
}

function momentOf(stamp: Stamp | undefined, because: string): Moment {
  return stamp === undefined
    ? { kind: "unknown", because }
    : { kind: "known", at: stamp.at, fact: stamp.fact };
}

export function changedAtOf(nodes: readonly PositionNode[]): Moment {
  const stamps = nodes.flatMap((node) =>
    node.attempts.flatMap((attempt) => [...observedStamps(attempt), ...saidStamps(attempt)]),
  );
  return momentOf(
    latest(stamps),
    "no session of this graph has a narrated step, a note or a person's words in the journal",
  );
}

export function sinceAtOf(attention: Attention, nodes: readonly PositionNode[]): Moment {
  switch (attention.standing.kind) {
    case "done":
      return momentOf(
        latest(nodes.flatMap((node) => node.attempts.flatMap(observedStamps))),
        "the graph is done and no session of it has a narrated step in the journal",
      );
    case "approval":
      return {
        kind: "unknown",
        because: "the journal records no time for a gate move, and approval is a gate",
      };
  }
  const node = attention.node;
  const attempt =
    node === undefined ? undefined : liveOrLatestAttempt(node.attempts, isLiveAttempt);
  if (node === undefined || attempt === undefined) {
    return {
      kind: "unknown",
      because: `${attention.standing.node} has no attempt, so no journal fact says when it entered this state`,
    };
  }
  return momentOf(
    latest(observedStamps(attempt)),
    `${node.id}'s latest attempt has no narrated step or delivered words in the journal`,
  );
}
