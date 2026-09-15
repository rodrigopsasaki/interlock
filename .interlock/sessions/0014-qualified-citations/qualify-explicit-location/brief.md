---
interlock: brief@v1
graph: 0014-qualified-citations
node: qualify-explicit-location
role: worker
gates: []
scope:
  - packages/verifier/src/foundAt.ts
  - packages/verifier/src/verify.ts
  - packages/verifier/test/foundAt.test.ts
  - packages/runner/test/gateJudge.test.ts
context_scope:
  - packages/verifier/src/foundAt.ts
  - packages/verifier/src/verify.ts
  - packages/substrate/src/evidence.ts
substrate:
  address: none
---

# Match the citation, not merely the file

Read AGENTS/design and your graph acceptance. The current foundAt tokenizer loses
line suffixes, searches quotes across the file, and can turn a missing explicit
path with a quotation into out-of-band rootedness. Fix that bounded class; do not
claim semantic understanding. The evidence filter already omits unrooted
discoveries. Extend its real gateJudge regression; do not build a second harness.

Before code, record your supported explicit-location grammar and the test map.
Use conservative handling when several paths or quotation delimiters appear.
Preserve old artifacts; only newly computed marks get verifier@1. A bare legacy
path is a weaker citation and remains so. No silent automatic ratification.

Read current source, schemas and tests, not prior sessions, receiver data, notes
repository, sibling worktrees or Git history of earlier session artifacts.
Record genuine discoveries only; every found_at with a numeric location needs a
separate exact source quotation. A claim's because must follow from its source;
if it does not, name the uncertainty rather than inventing a cause.

## Environment and closure

Use mise exec -- pnpm (Node24.14.0). For targeted tests use exactly
`mise exec -- pnpm --filter verifier --fail-if-no-match exec vitest run test/foundAt.test.ts test/verify.test.ts`.
Use per-command `git -c commit.gpgsign=false commit` for commits, not global or
shared config. No as, non-null assertions or as const, including fixtures.
Consult current schemas/notes@v0.json and schemas/debrief@v2.json; do not copy an
older session. Actual UTC, runtime codex/model gpt-5.6-terra, initial generated
brief commit as session_start_sha, and graph_base_sha from your generated brief.
head_sha is your last implementation commit, preceding final notes/debrief.
Quote YAML containing colon-space. Finalize your own artifacts, then run
`mise exec -- pnpm interlock schema reference` and commit the resulting reference
with those artifacts. Leave full-suite/listener gates to the harness. No repeated
EPERM tests, external service, extra agent/session, manual absorb, push, main
merge, waiver or existing-brain change. Commit clean work and stop.

## Context slice

The harness inserts context here. Hypotheses are not ratified judgments.
