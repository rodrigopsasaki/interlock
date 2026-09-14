---
interlock: brief@v1
graph: 0006-repository-context
node: send-repository-context
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: lint
    kind: command
    run: pnpm lint
  - id: comments
    kind: command
    run: pnpm check:comments
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: repository-wire-proof
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test
    expect_output: Tests +[1-9][0-9]* passed
  - id: shape-reference-fresh
    kind: command
    run: pnpm interlock schema reference --check
scope:
  - AGENTS.md
  - docs/design/0003-substrate.md
  - schemas/substrate/context.request.json
  - schemas/substrate/absorb.request.json
  - schemas/local@v0.json
  - packages/substrate/src/client.ts
  - packages/substrate/src/address.ts
  - packages/substrate/src/httpClient.ts
  - packages/runner/src/localConfig.ts
  - packages/cli/src/run.ts
  - packages/cli/src/plan.ts
  - packages/cli/src/judge.ts
  - packages/runner/test/gateJudge.test.ts
substrate:
  address: none
---

# Same repository in, same repository out

Read AGENTS.md, design 0003 and the complete graph. Its scope remains binding
even when the harness expands the tracked-file inventory. You are one fresh
Terra/high implementation worker. No agents, new sessions, approval, waiver,
external service, push or merge. Root holds the finite six-graph delegation.

The existing local brain is reachable but context cannot resolve which of several
repositories is intended. This slice supplies that missing identity on both
verbs. It does not pretend a successful HTTP call proves useful learning.

Root's decision is the existing /substrate@v1 routes plus an optional repository
object {owner,name,origin_url}, not new v1.2 endpoints or capability negotiation.
Design D26 already permits additive fields and receiver checksum re-vendoring.
Old strict validators still refuse unknown fields: substrate.send_repository is
explicitly default-off and enabled only after receiver verification. Config is
additive but type-checked. Address none still works without Git identity.

Inspect the actual client constructors in run.ts, plan.ts and judge.ts; resolve
the Git origin outside the generic HTTP client and bind the same data object to
context and absorb. Reuse existing Result/refusal seams. Local argv-based Git
fixtures and fake HTTP suffice. Existing context/absorb tests assert exact old
bodies; retain them. A no-retry refusal test matters particularly for writes.
Origin is provenance, not authority; never leak URL credentials in errors.

The prior output-retention code has a reviewed test defect: a 10ms timer between
two stdout writes does not guarantee two read chunks. Keep the real raw Euro-byte
test, but prove legacy decoded-per-chunk hashing without relying on OS delivery.
Do not fix the implementation to match an invalid test oracle or add longer waits.

The previous harness run passed five gates including its focused output tests,
but the full workspace suite failed. Its worker reported two unchanged capability
tests timing out. Root's isolated `vitest run test/capabilities.test.ts` diagnostic
then passed all three in 20ms of tests; this does not clear the historical gate
or establish a root cause. Do not raise timeouts or remove tests to make it green.
This runner candidate will retain subsequent gate output for diagnosis. Preserve
the full standing suite, and report any reproducible coupled failure precisely.

Keep this small enough to finish one session. Prefer narrow helpers and existing
schema/CLI test patterns, not a generic identity platform. Regenerate shape docs
using `pnpm interlock schema reference`. All standing gates remain. No casts,
non-null assertions, or source comments. Inspect actual scripts before commands.

Record new discoveries and decisions with their source paths/hunks and an
acceptance-to-test map. Preserve old artifacts. Obtain graph_base_sha from the
generated brief, session_start_sha from initial HEAD, head_sha from the last code
commit. Actual runtime codex, model gpt-5.6-terra, high effort. Conventional why
commits; per-command commit.gpgsign=false allowed because signing is unavailable,
not global settings changes. Commit code and valid new notes/debrief and stop.
