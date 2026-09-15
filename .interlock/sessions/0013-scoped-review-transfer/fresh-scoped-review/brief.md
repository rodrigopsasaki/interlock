---
interlock: brief@v1
graph: 0013-scoped-review-transfer
node: fresh-scoped-review
role: worker
gates: []
scope:
  - packages/debrief/src/brief.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/briefRewrite.ts
context_scope:
  - packages/debrief/src/brief.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/briefRewrite.ts
substrate:
  address: none
---

# Review query selection against work authority

First read only this generated opening view, AGENTS/design and current code.
Your source entry points are packages/debrief/src/brief.ts,
packages/runner/src/sessionBrief.ts and packages/runner/src/briefRewrite.ts.
Use their current tests and schemas to check the contract. The first action
must not be a survey of .interlock/sessions or Git history. Other sessions'
artifacts are excluded even if they look like useful formatting examples.

Read your node acceptance. Write the bounded source-cited report at
docs/experiments/learning-transfer/scoped-review.md. Assess current behavior,
not a predetermined flaw: query selection versus authority, backward
compatibility, and refusal/none behavior. No implementation or test edits.
The implementation code is an explicit dependency; its conversation and
debrief are not. Retrieved items are hypotheses or observations to check.
If an item informs a decision, cite its exact statement and derivation and
tie that decision to a source-checked report hunk. If unhelpful, say so.
Never turn repeated wording into a claim of improved judgment.

Record any accidental excluded exposure precisely and do not pretend its
influence was erased. Use only current schemas for notes/debrief structure.
No reading another session's brief, report, notes, debrief, journal/outbox,
sibling worktree, receiver files/key or notes repository.
Do not open docs/shapes.md or display its diff: its generated examples can
contain historical session artifacts too. Run the required generator and
freshness check without inspecting that generated content; root reviews it.
Current JSON schemas are the artifact-format source for this review.

## Artifacts and environment

Use current schemas/notes@v0.json and schemas/debrief@v2.json for artifact
shapes, never older sessions as examples. Initial generated brief commit is
session_start_sha; graph_base_sha is in your brief. Use actual UTC from a
clock, runtime codex/model gpt-5.6-terra in your own provenance. Notes append
choices with because and surprises with expected/observed. Every claimed
decision points to a produced hunk; found_at points to actual current source.
Conventional why-commits; per-command unsigned commits allowed, no globals.
Use mise exec -- pnpm on Node24.14.0; default shell26 is not the pinned runtime.
Deterministic targeted tests only locally; leave listener/full-suite gates to
the harness. No EPERM retries, timeout inflation, external services, extra
agents/sessions, manual absorb, push, main merge, waivers or brain changes.
Write final notes/debrief content, then mechanically regenerate docs/shapes.md
using the existing schema reference CLI in this worktree, check, commit, stop.
Do not change final artifacts again without regenerating that reference.

## Context slice

The harness may include context with provenance. Absence is an honest result.
