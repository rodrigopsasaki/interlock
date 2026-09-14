---
interlock: brief@v1
graph: 0008-learning-witness
node: source-a
role: worker
gates: []
scope:
  - packages/substrate/src/evidence.ts
  - packages/substrate/src/derivationString.ts
  - packages/verifier/src/verify.ts
  - packages/substrate/test/evidence.test.ts
substrate:
  address: none
---

# Diagnose the evidence boundary for a later test designer

Read AGENTS.md, the complete graph and relevant source. This is one diagnosis
node, not an implementation repair. Explain the small set of assumptions a
test designer needs to avoid confusing rootedness, scope, provenance and
correctness. Inspect source; don't inherit other session narratives. A useful
discovery is context this brief did not supply, not a requirement to find a bug.

Your report is docs/experiments/learning-witness/source-a.md. Use exact source
citations. Make a concise test-design suggestion grounded in what actually
exists, and label limits. Return truthful typed discoveries/decisions in your
debrief. A discovery's found_at must be an actual repository source location,
not just your new report or an invented command receipt. No compulsory positive
finding. Keep the report and session artifacts the only edits.

No subagents, sibling sessions, graph approval, live substrate calls, remote
access or historical-session reading. The runner-expanded inventory is not
permission to widen scope. The harness will run standing and declared gates,
verify your debrief, and handle absorb itself. If the sandbox refuses a local
listener, do not retry HTTP tests or raise timeouts: name it and leave the full
suite to the harness. This task mainly needs source reading and artifact
validation. Use actual UTC timestamps from the clock, not guessed chronology.

Runtime codex, model gpt-5.6-terra. Use generated runner metadata for graph-base
and session-start SHAs; last code/report commit precedes debrief commit. Refer
to schemas/CLI validators for shape details, not prior session content. Commit
with a why-bearing Conventional Commit; commit.gpgsign=false per invocation is
allowed if signing is unavailable. Never change global settings or keys.

## Context slice

The harness may supply retrieved context here. Absence remains absence.
