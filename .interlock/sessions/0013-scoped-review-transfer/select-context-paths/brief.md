---
interlock: brief@v1
graph: 0013-scoped-review-transfer
node: select-context-paths
role: worker
gates: []
scope:
  - packages/debrief/src/brief.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/briefRewrite.ts
  - schemas/brief@v1.json
substrate:
  address: none
---

# Separate retrieval selection from work authority

Read AGENTS/design and your node acceptance. Start with the current brief reader,
sessionBrief's authoritative inventory/context call, and briefRewrite's final
frontmatter. A new optional context_scope is an advisory selection of existing
tracked paths. The full scope remains the runner's work/proof authority.
Do not repurpose scope or introduce brief@v2. Preserve omitted legacy behavior.
No type assertions, including as const, in source or fixtures: use explicit
contract annotations and narrowing. Quote YAML prose containing a colon-space
or use block scalars so notes remain valid without a repair pass.

Before code, record a map for parser/schema invalid forms, selected query/full
canonical scope, omitted legacy query, missing-path zero-call refusal, none,
and selector metadata in the derived opening view. The query uses selected
paths in an actual captured stub-runtime CLI run too:3000 tracked paths,
three selected, canonical and ledger scope full, selector in opening metadata,
canonical commit before prompt. Reuse the preceding graph's fixture where
appropriate; do not build another harness. The query uses selected
paths only after membership validation. Keep the public refusal typed and
explainable. A valid selector must not require an actual substrate.
Canonical scope, ledger scope, commands and receipts do not narrow.

The fresh reviewer's source brief is already written; do not read/edit it.
Do not read other session artifacts for context or examples. Read source,
schemas and tests; discoveries must name actual source locations. Never invent
a discovery to feed the receiver. Root and harness handle delivery and review.

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
