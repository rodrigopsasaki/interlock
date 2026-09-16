---
interlock: brief@v1
graph: 0024-debrief-content
node: validate-debrief-content
role: worker
gates: []
scope: []
context_scope:
  - packages/cli/src/debrief/validate.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/schemas/test/corpus.files.test.ts
substrate:
  address: none
---

# Finish one reviewed validation repair

Read AGENTS.md, the design note and graph acceptance. This is implementation.
Current source parses a YAML debrief but delegates its schema check to validateFile,
which dispatches .md as brief front matter and can falsely accept invalid v2.
Compose judgeValue / describeOutcome / isRefusal against the raw parsed YAML,
keeping the registry lazy and existing error handling. Prove both valid and
invalid debrief content under .yaml, .md and .jsonl. Preserve old readers and
the exact-history custody rule already implemented in corpus.files.test.ts.

Prior worker source6156ff6 and artifact16513b4 are inherited, not yours. A
paused fix exists in another checkout but must stay untouched. Author and test
this bounded fix here; all new notes and debrief belong to graph0024 and this
fresh session. Do not modify any historical brief, notes or debrief. No sibling
edits, additional agents, merge, push, trust changes or permission changes.

Use mise exec -- pnpm and git -c commit.gpgsign=false. No type/non-null
assertions or new source comments. The current runtime is codex/gpt-5.6-terra;
agent derivation has only kind, runtime, model. Attribute external reports as
reports, not your own gate runs. Use truthful actual-time notes, an authored v2
debrief, explicit revise for corrections, and validate before final commit.

Finish the source, run focused tests, author the complete debrief and commit
cleanly. Then finish normally without waiting for a root reply. Root will review
the completed handoff and will never re-prompt this session during judging.
The harness produces standing-gate receipts; do not claim those as worker runs.

## Context slice

No learned context is requested for this bounded repair. The root-supplied
reproduction above is not evidence of substrate learning.
