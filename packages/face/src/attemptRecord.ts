import {
  type DebriefKind,
  debriefKindsPresent,
  isNodeRole,
  type MarkCounts,
  type NodeRole,
  type SessionView,
  type Walk,
} from "ledger";

export interface AttemptBrief {
  readonly path: string;
  readonly role?: NodeRole;
  readonly acceptance: string;
  readonly walk: Walk;
}

export type AttemptMarks =
  | { readonly kind: "counted"; readonly counts: MarkCounts }
  | { readonly kind: "unknown"; readonly because: string };

export interface AttemptDebrief {
  readonly path: string;
  readonly version: number;
  readonly kinds: readonly DebriefKind[];
  readonly marks: AttemptMarks;
}

function sessionFile(session: SessionView, file: string): string {
  return `.interlock/sessions/${session.node.graph}/${session.node.id}/${file}`;
}

function walkOf(session: SessionView, role: NodeRole | undefined): Walk {
  if (session.walk !== undefined) return session.walk;
  return {
    kind: "none",
    because:
      role === undefined
        ? "the node names no role, so its brief carried no walk"
        : "this session started before the journal recorded the walk a brief gave",
  };
}

export function attemptBriefOf(session: SessionView): AttemptBrief {
  const role = isNodeRole(session.brief.role) ? session.brief.role : undefined;
  return {
    path: sessionFile(session, "brief.md"),
    ...(role === undefined ? {} : { role }),
    acceptance: session.brief.acceptance,
    walk: walkOf(session, role),
  };
}

export function attemptDebriefOf(session: SessionView): AttemptDebrief | undefined {
  if (session.debrief === undefined) return undefined;
  return {
    path: sessionFile(session, "debrief.yaml"),
    version: session.debriefFilings,
    kinds: debriefKindsPresent(session.debrief),
    marks:
      session.markCounts === undefined
        ? { kind: "unknown", because: "the verifier's marks were not recorded when it was filed" }
        : { kind: "counted", counts: session.markCounts },
  };
}
