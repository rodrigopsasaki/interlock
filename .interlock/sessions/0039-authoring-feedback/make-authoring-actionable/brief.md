---
interlock: brief@v1
graph: 0039-authoring-feedback
node: make-authoring-actionable
role: worker
gates: []
scope: []
context_scope:
  - packages/runner/src/debriefAuthoringGuidance.ts
  - packages/runner/src/openingPrompt.ts
  - packages/verifier/src/foundAt.ts
substrate:
  address: none
---

## Task

Implement the approved authoring-feedback change as one complete delivery.
Read AGENTS and actual source. Received context is provisional; checked use,
rejection and no-use are all valid. Do not repair older handoffs or turn this
guidance into a convention gate. Actual authorship is codex/gpt-5.6-terra.
Use date -u for each note, full Git IDs and mise exec. Retain yielded exec
handles; one local check at a time; focused tests and lint before handoff, full
suites belong to the harness. Preserve all candidates. Use normal derived first
filing after committing source and stop after the committed canonical debrief.
No subagents, dependencies, trust/permission/config changes, external inference,
live brain, push, merge or deploy. Per-command unsigned commits are allowed if
signing is unavailable. Do not claim successful learning merely from inclusion.
