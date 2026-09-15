---
interlock: brief@v1
graph: 0021-current-debrief
node: select-current-debrief
role: worker
gates: []
scope: []
context_scope:
  - packages/debrief/src/debrief.ts
  - packages/debrief/src/paths.ts
  - packages/runner/src/sessionBrief.ts
substrate:
  address: none
---

# Give corrected learning a dependable handoff

Read AGENTS.md, the design note and graph acceptance. Implement the command,
tests and worker handoff integration, not another report. A preceding worker
corrected its debrief into a side filename while the harness still read the old
canonical file. The command must preserve history AND make the explicit authored
selection current; it must not infer that any newer-looking file is authoritative.

Use the existing artifact readers and CLI conventions. Keep receipt/claim bytes,
session identity, prior-version readers, and existing scopes intact. Prefer one
shared implementation with a thin CLI. No automatic commit, node clearance,
knowledge ratification, new model adapter, new dependency or standing-gate change.
The runner supplies actual retained context below; inspect any useful hypothesis
against source, and use or reject it on its merits. Do not manufacture a use claim.

You are the only writer in your task-owned checkout. No extra agents, sibling
checkout edits, push, merge, trust/sandbox edits, live-brain changes or direct
network writes. The harness handles the configured disposable substrate exchange.
Use mise exec -- pnpm; git -c commit.gpgsign=false for commits. No source comments
or type/non-null assertions. Targeted tests while working, standing suite by harness.

Append actual-time notes and a truthful debrief. Runtime configured for this
session is codex / gpt-5.6-terra / high; use that exact model, not a family alias.
Use generated brief identity and actual implementation head. Finalize a first
debrief, then exercise your command with an authored correction/revision that
accurately records its real use. Preserve both versions and leave the intended
version at debrief.yaml. The final debrief's head precedes its artifact commit.
Run pnpm interlock schema reference, commit clean, and finish normally without
waiting for root at a prose checkpoint. A debrief is authored by you, never by
the reviewer on your behalf.
