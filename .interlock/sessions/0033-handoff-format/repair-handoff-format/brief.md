---
interlock: brief@v1
graph: 0033-handoff-format
node: repair-handoff-format
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/debrief/derived.ts
  - packages/cli/src/debrief/sessionIdentity.ts
  - packages/debrief/src/custody.ts
substrate:
  address: none
---

# Repair the delivery, not the design

Read AGENTS.md and this graph. The preceding0032 final81b6fd5 is held only by
lint; full tests and the scoped proof passed under the harness. Its lint receipt
98897ae86a8c372b0da4fc2e012f6945581d87f19330544f4e4ca917a41c8ff0
contains formatting, organized imports/exports and a type-only import finding.
Use the installed Biome fixes only on the files introduced/touched by0032;
review the diff for semantics. Do not alter old session bytes, timeouts, tests,
gates or behavior. One local check at a time; run lint before handoff and leave
full suites to the harness. Keep session_id for any yielded exec and poll it,
never duplicate an in-flight command. No agents, permission/trust changes,
push/merge/deployment, existing-brain access or unrequested external effects.

Use mise exec -- pnpm --silent interlock from THIS checkout, not the global
executable. Per-command git -c commit.gpgsign=false is permitted if signing is
inaccessible; do not change config. Commit source, then use prepare with explicit
--agent-runtime codex --agent-model gpt-5.6-terra, author the candidate and
file-derived for this session. If already filed, corrections use revise and retain
prior bytes. Use actual date -u/hashes. Received context is provisional, not
authority; state actual use or irrelevance without forcing a positive claim.
Validate the handoff, commit cleanly and stop. One 25-minute attempt.
