---
interlock: brief@v1
graph: 0035-review-grace
node: restore-post-settle-grace
role: worker
gates: []
scope: []
context_scope:
  - packages/runner/src/sessionWait.ts
  - packages/runner/test/sessionWait.test.ts
substrate:
  address: none
---

# Give settlement its complete response window

Read AGENTS.md and the approved0035 graph. Implement its bounded timing repair
with the existing injected clock. Prove both affected branches with controlled
time spent inside the blocking wait, not a wall-clock sleep. Preserve original
deadline capping and all adjacent session behavior. Prefer tests first; honestly
record a red regression against unchanged source if you observe it, then the
green result. Do not change an expectation just to clear a gate. The harness
runs the declared focused proof and standing gates after your handoff.

One 25-minute attempt, no extra agents or post-handoff edits. Run one local
check at a time through mise exec, retain/poll yielded exec session_id, and run
lint before handoff. No trust/permission changes, push, main merge, deployment,
new dependencies, existing-brain access or unrequested external effect. A
per-command unsigned commit is permitted if signing is inaccessible; no config
changes. Use date -u for each new note: no placeholder or inferred past times.

Received context is provisional; record actual checked use, rejection or no use,
not a forced benefit. Use THIS checkout CLI via mise exec -- pnpm --silent
interlock. Commit source, prepare with --agent-runtime codex --agent-model
gpt-5.6-terra, author the candidate, file-derived and validate before the final
commit. Retain authored candidates; after first filing corrections use revise.
Use real full Git identities. Commit cleanly and stop.
