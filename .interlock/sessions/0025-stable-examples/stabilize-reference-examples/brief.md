---
interlock: brief@v1
graph: 0025-stable-examples
node: stabilize-reference-examples
role: worker
gates: []
scope: []
context_scope:
  - packages/schemas/src/reference
  - packages/schemas/test/reference.test.ts
  - docs/shapes.md
substrate:
  address: none
---

# A completed session must not silently choose our published examples

Read AGENTS.md, design note, and graph acceptance. The actual prior full gate
failed docs/shapes.md line775: expected source0014/qualify-explicit-location,
received source0024/validate-debrief-content. buildCorpusExamples chooses by
size from all live artifacts; the new valid debrief is smaller. This is not a
schema mismatch. Own the narrow reference-selection change, not a generator
rewrite or blanket corpus exclusion. Use deliberate source selections, kept
readable with their provenance, validated by the existing shapes/readers.
Preserve the currently published example choices where possible. Reuse current
no-example handling for unrepresented versions. New sessions must remain fully
validated by the independent corpus check. Include isolated regression tests.

Do not edit any old brief, notes or debrief. Source validation repair inherited
from graph0024 is still under proof, not a new claim of yours. No sibling edits,
additional agents, push, merge, trust changes, permission changes or network
effects. mise exec -- pnpm; git -c commit.gpgsign=false. No new source comments,
type assertions or non-null assertions. Your derivation is codex/gpt-5.6-terra,
with only kind/runtime/model. Attribute root reports as reports in notes.

Author actual-time notes and a complete truthful debrief. Use revise to correct
an authored debrief, never overwrite a started brief. Check schema validity and
generated-reference freshness after your new artifacts exist. Commit cleanly
and finish normally; do not wait for review or resume during harness judging.

## Context slice

The runner may supply hypotheses here; none is a ratified rule or proof.
