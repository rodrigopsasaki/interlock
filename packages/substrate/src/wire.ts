import { DEBRIEF_V2, NOTES_V0 } from "debrief";
import type { Debrief, DebriefDerivation, Drafted, Note } from "ledger";

// The wire shapes debrief@v2.json and notes@v0.json require on disk and over the protocol:
// snake_case, carrying their own "interlock" tag. `Debrief` and `Note` are the harness's
// in-memory, camelCase shapes; these are their protocol-facing translation, one field renamed
// at a time, nothing inferred.

export interface WireDiscovery {
  readonly id: string;
  readonly what: string;
  readonly found_at: string;
  readonly mattered_because: string;
}

export interface WireDecision {
  readonly id: string;
  readonly what: string;
  readonly because: string;
  readonly rests_on: readonly string[];
  readonly hunks: readonly string[];
  readonly produces?: readonly string[];
  readonly rejected?: string;
}

export interface WireGateRun {
  readonly id: string;
  readonly result: "pass" | "fail";
  readonly invocation?: string;
  readonly note?: string;
}

export interface WireDebrief {
  readonly interlock: typeof DEBRIEF_V2;
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly graph_base_sha: string;
  readonly session_start_sha: string;
  readonly head_sha: string;
  readonly derivation: DebriefDerivation;
  readonly discoveries: readonly WireDiscovery[];
  readonly decisions: readonly WireDecision[];
  readonly gates_run_by_agent: readonly WireGateRun[];
  readonly open: readonly string[];
  readonly drafted?: Drafted;
}

export interface WireNotes {
  readonly interlock: typeof NOTES_V0;
  readonly node: string;
  readonly entries: readonly Note[];
}

export function toWireDebrief(debrief: Debrief): WireDebrief {
  return {
    interlock: DEBRIEF_V2,
    graph: debrief.graph,
    node: debrief.node,
    role: debrief.role,
    graph_base_sha: debrief.graphBaseSha,
    session_start_sha: debrief.sessionStartSha,
    head_sha: debrief.headSha,
    derivation: debrief.derivation,
    discoveries: debrief.discoveries.map((discovery) => ({
      id: discovery.id,
      what: discovery.what,
      found_at: discovery.foundAt,
      mattered_because: discovery.matteredBecause,
    })),
    decisions: debrief.decisions.map((decision) => ({
      id: decision.id,
      what: decision.what,
      because: decision.because,
      rests_on: decision.restsOn,
      hunks: decision.hunks,
      ...(decision.produces === undefined
        ? {}
        : { produces: decision.produces }),
      ...(decision.rejected === undefined
        ? {}
        : { rejected: decision.rejected }),
    })),
    gates_run_by_agent: debrief.gatesRunByAgent.map((run) => ({
      id: run.id,
      result: run.result,
      ...(run.invocation === undefined ? {} : { invocation: run.invocation }),
      ...(run.note === undefined ? {} : { note: run.note }),
    })),
    open: debrief.open,
    ...(debrief.drafted === undefined ? {} : { drafted: debrief.drafted }),
  };
}

export function toWireNotes(nodeId: string, notes: readonly Note[]): WireNotes {
  return { interlock: NOTES_V0, node: nodeId, entries: notes };
}
