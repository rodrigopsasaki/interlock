---
interlock: brief@v1
graph: 0031-repair-planning-context
node: repair-planning-context
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/plan.ts
  - packages/cli/test/plan.test.ts
  - packages/debrief/src/brief.ts
substrate:
  address: none
---

# Restore compatible planning selection

Read AGENTS.md and graph acceptance. The unchanged prior candidate is held by
five assertions. Four addressed-context tests enable send_repository but omit
Git origin: reuse the valid origin fixture, do not bypass origin refusal. The
real regression is inheritance in plan.ts refusing every missing/non-v1 read.
The brief reader distinguishes missing-file, valid legacy, and present-invalid.
Do not change no-ask recovery behavior while restoring explicit-ask corrections.
Add regression proof for those distinct cases and a normalizable path alias.

Received context is provisional, not a requirement or authority. Inspect sources
before using an earlier lesson; describe actual use or irrelevance honestly.
One implementation attempt, no follow-up after committed debrief. No dependencies,
new agents, push/main merge, permissions, live-brain access, gate waiver or old
artifact changes. Run suites sequentially with mise exec -- pnpm.

Use actual date -u timestamps and full Git hashes. session_start_sha is the
commit introducing this generated session-specific brief (not its older template).
Derivation agent/codex/gpt-5.6-terra. Quote YAML scalars containing colons.
Commit source before recording head_sha; validate final artifacts, commit cleanly,
and stop. A defect needing correction after handoff is the next iteration.
