import type { Item } from "debrief";
import {
  derivation,
  duration,
  spend,
  type Debrief,
  type Note,
  type Receipt,
} from "ledger";

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
