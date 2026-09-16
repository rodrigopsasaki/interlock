---
interlock: brief@v1
graph: 0036-handoff-preview
node: preview-candidate-learning
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/debrief/validate.ts
  - packages/cli/src/verify.ts
  - packages/substrate/src/evidence.ts
  - packages/runner/src/debriefAuthoringGuidance.ts
substrate:
  address: none
---

# Feedback before the handoff closes

Read AGENTS.md and the approved0036 graph. The existing verifier and translator
own their semantics. Build a local preview that lets the author see them against
an unfiled candidate. No journal or network, no copied policy, no forced lesson.
Use one byte snapshot for reader/schema validation and preview. Keep claim IDs
beside actual marks and translated scope; duplicate prose is not an identity.
Compose per-claim evidence through the existing translator if that is simpler
than a new association protocol. Explicit Git source identity is declared, not
attested by this command. Canonical judgment remains separate.

One25-minute attempt, no extra agents or post-handoff edits. Work through this
checkout's CLI via mise exec -- pnpm --silent interlock. Run one local check at
a time through mise exec, retain/poll yielded session_id; lint before handoff.
No permission/trust/config change, dependency, push, merge, deployment, real
brain or external effect. Per-command unsigned commits are allowed if signing
is inaccessible. For each new note use date -u; no placeholder timestamps.

Treat received context as provisional: checked use, rejection or no-use are all
valid. Keep optional applicability authored and justified, not demanded for a
positive result. Commit source, prepare with --agent-runtime codex --agent-model
gpt-5.6-terra, author the retained candidate, try your preview honestly, and
file-derived plus validate before the final commit. Do not alter prior session
artifacts or test outcomes to make this pass. After first filing use revise for
corrections. Record actual full Git IDs, commit cleanly and stop.
