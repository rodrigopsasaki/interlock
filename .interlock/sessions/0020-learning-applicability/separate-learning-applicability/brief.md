---
interlock: brief@v1
graph: 0020-learning-applicability
node: separate-learning-applicability
role: worker
gates: []
scope: []
context_scope:
  - packages/substrate/src/evidence.ts
  - packages/ledger/src/debrief.ts
substrate:
  address: none
---

# Preserve useful applicability without changing proof

Read AGENTS.md, docs/design/0001-interlock.md and this graph's acceptance.
Our actual next-task path query missed a useful lesson about discoveryItem's
sentinel branches because its decision hunk was a notes artifact. The source
evidence location is correct; its automatic use as applicability is the gap.
Implement the complete optional authored applicability path, not a report.

Use existing repository/path scope semantics (no organisation-wide grant).
Do not guess applicability from what/because text or rewrite historical claims.
The author proposes scope, not truth. Keep invalid/unsafe paths out; reuse or
factor the existing path contract without creating a package dependency cycle.
Every old artifact must retain its interpretation when the field is absent.
Inspect actual receiver-compatible nested schemas before forwarding a new field.
Do not change the protocol top-level contract, standing table or verifier.

Primary seams: ledger debrief types/guards, debrief parsers, schemas/parts,
substrate evidence and wire mapping. Existing test fixtures and actual historical
claim content in docs/experiments/comparable-learning/inputs/source-debrief.yaml
are available as corpus; preserve it, use a new explicitly qualified fixture.
Show support versus applicability in a small docs example, not a new policy.

Work only in your task-owned checkout; no sibling-history fishing, new agents,
push, merge, trust/config edits, network writes, probes or learning ratification.
Use mise exec -- pnpm and git -c commit.gpgsign=false for commits. No source
comments, type assertions or non-null assertions. Run targeted tests while
working; the harness runs all standing gates. Do not inflate timeouts.

Append typed notes with actual UTC. Capture findings that improve future briefs,
with exact supported citations; distinguish reusable knowledge from a status
summary. Use the new applies_to only where you can justify it. The runner starts
from older code, so do not depend on the new field being emitted in this run's
outbox; root will assess that boundary before a later session.
Use generated brief metadata for debrief@v2, actual runtime/model, an actual
implementation head before the final artifact commit. Run pnpm interlock schema
reference after finalizing artifacts. Commit clean, then finish normally. Do not
wait for a prose review handoff: the current runner's short grace is unreliable.
