---
interlock: brief@v1
graph: 0029-planning-context
node: select-planning-context
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/plan.ts
  - packages/runner/src/sessionBrief.ts
  - packages/debrief/src/brief.ts
substrate:
  address: none
---

# Keep planning context separate from authority

Read AGENTS.md, design note and graph acceptance. The live public planner query
used650 tracked paths and returned665 items,640 of them coverage absences. This
is a query-design problem, not permission to hide absences or change receiver
semantics. Expose deliberate query selection through the existing context_scope
contract while preserving full work authority and legacy omission behavior.

Inspect plan.ts composeBrief and correction flow; sessionBrief.ts already uses
optional contextScope separately from authoritativeScope. Reuse existing readers,
renderBriefFile and exact-tracked checks. Tests must discriminate query scope
from authority, including an explicit empty list and correction inheritance.
No implicit scope inference, planner-role renaming, wire change or approval bypass.

One implementation attempt, no post-handoff correction. No dependencies, new
agents, push/main merge, permissions, live brain, gate waiver or old-artifact edits.
Run suites sequentially with mise exec -- pnpm; root supplies independent proof.
Real date -u timestamps, actual full Git hashes, generated session-specific brief
transition (not the older template or diff-filter=A). Derivation agent/codex/
gpt-5.6-terra. Quote YAML scalar strings containing colons. Preserve authored
mistakes through supported revision/candidate. Commit code before head_sha;
validate final artifacts, commit cleanly, and stop.
