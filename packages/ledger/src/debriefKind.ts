import type { Debrief } from "./debrief.ts";

export const DEBRIEF_KINDS = [
  "discoveries",
  "decisions",
  "hunks",
  "proof",
  "findings",
  "graph",
  "marks",
] as const;

export type DebriefKind = (typeof DEBRIEF_KINDS)[number];

export function isDebriefKind(value: unknown): value is DebriefKind {
  return DEBRIEF_KINDS.some((kind) => kind === value);
}

const isPresent: Readonly<Record<DebriefKind, (debrief: Debrief) => boolean>> = {
  discoveries: (debrief) => debrief.discoveries.length > 0,
  decisions: (debrief) => debrief.decisions.length > 0,
  hunks: (debrief) => debrief.decisions.some((decision) => decision.hunks.length > 0),
  proof: (debrief) => (debrief.proof ?? []).length > 0,
  findings: (debrief) => debrief.findings !== undefined,
  graph: (debrief) => debrief.graphFile !== undefined,
  marks: (debrief) => (debrief.marks ?? []).length > 0,
};

export function debriefKindsPresent(debrief: Debrief): readonly DebriefKind[] {
  return DEBRIEF_KINDS.filter((kind) => isPresent[kind](debrief));
}
