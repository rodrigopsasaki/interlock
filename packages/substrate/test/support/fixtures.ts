import type { Item } from "debrief";
import { type Debrief, derivation, duration, type Note, type Receipt, spend } from "ledger";

export const fixtureItem: Item = {
  kind: "convention",
  statement: "commits state the why in the subject",
  standing: "ratified",
  scope: { kind: "repository" },
  derivation: "human:Rodrigo Sasaki",
};

export const fixtureDebrief: Debrief = {
  graph: "0003-translator",
  node: "substrate-client",
  role: "worker",
  graphBaseSha: "a".repeat(40),
  sessionStartSha: "a".repeat(40),
  headSha: "b".repeat(40),
  derivation: {
    kind: "agent",
    runtime: "claude-code",
    model: "claude-sonnet-5",
  },
  discoveries: [
    {
      id: "d1",
      what: "schemas depends on runner",
      foundAt: "packages/schemas/package.json",
      matteredBecause: "a naive package edge would have cycled",
    },
  ],
  decisions: [
    {
      id: "c1",
      what: "kept the ajv registry local to this package",
      because: "schemas depends on runner, which depends on this package",
      restsOn: [],
      hunks: ["packages/substrate/src/registry.ts:1-40"],
    },
  ],
  gatesRunByAgent: [],
  open: [],
};

export const explicitlyApplicableHistoricalDecision: Debrief["decisions"][number] = {
  id: "c2",
  what: "Qualified the retained discovery-scope claim to non-sentinel rooted hunks and preserved sentinel rooted hunks as repository scope.",
  because:
    "discoveryItem returns no item for an unrooted mark, repository scope for command or out-of-band citation, and path scope only in its remaining rooted branch.",
  restsOn: ["brief: outstanding requirement 2", "notes: retained-scope qualification choice"],
  hunks: [".interlock/sessions/0014-qualified-citations/qualify-explicit-location/notes.yaml"],
  appliesTo: { kind: "path", path: "packages/substrate/src/evidence.ts" },
};

export const fixtureNotes: readonly Note[] = [
  {
    kind: "choice",
    at: "2026-09-11T00:00:00Z",
    chose: "kept the ajv registry local to this package",
    because: "schemas depends on runner, which depends on this package",
  },
];

export const fixtureReceipt: Receipt = {
  id: "r1",
  gate: "context-renders",
  commitSha: "b".repeat(40),
  spend: spend.none(),
  duration: duration.unknown(),
  derivation: derivation.gate("context-renders", "runner@0", "run-1"),
  proof: { exitCode: 0 },
};
