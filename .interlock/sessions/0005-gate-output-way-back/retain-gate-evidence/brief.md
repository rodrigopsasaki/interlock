---
interlock: brief@v1
graph: 0005-gate-output-way-back
node: retain-gate-evidence
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
  - id: retained-output-proof
    kind: command
    run: pnpm --filter runner --fail-if-no-match exec vitest run test/gateJudge.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - AGENTS.md
  - docs/design/0001-interlock.md
  - .interlock/graphs/0005-gate-output-way-back.yaml
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/judge.ts
  - packages/runner/src/index.ts
  - packages/runner/test/gateJudge.test.ts
  - packages/face/src/root.ts
  - packages/ledger/src/receipt.ts
  - packages/ledger/src/sink.ts
  - schemas/parts/receipt.json
substrate:
  address: none
---

# Retain gate evidence

Read AGENTS.md and the complete approved graph. Its allowed paths and acceptance
bind; a runner-expanded scope inventory does not broaden them. You are a single
fresh implementation worker. Root holds a six-graph mandate; you cannot approve,
change acceptance, waive a gate, launch agents or start a follow-up.

The observed defect: `gateJudge.ts` buffers command stdout/stderr, computes
outputHash, then discards the output. A real held run could identify its failed
test file from a Vitest cache but not inspect its actual assertion trace through
the receipt. This is a small durability slice, not a logging system or new face.
Read `judgeGates`, `createReceipt`, the shared journal-root resolver and real
gate fixtures. Reuse them. The receipt proof is already an extensible object;
do not migrate old events just to add a reference.

Persist byte-exact stream artifacts before a receipt promises they exist. A
small helper plus tests is enough. Keep them under a stable shared-journal
location, not tracked source or a disposable node-only path. Safe immutable
same-hash writes; no silent truncation. Preserve the original outputHash and
regex meaning while adding independent stream references/counts. Old receipts
remain valid and explicitly lack the new evidence. Reader verifies content;
missing/corrupt output is not an empty success. Storage failure cannot clear a
node claiming evidence it did not retain. No model/vendor detail in this code.

Use real deterministic gate commands for the proof, including literal bytes,
empty stdout/stderr, nonzero, pattern mismatch, mixed streams and split UTF-8.
Keep representative assertions in `test/gateJudge.test.ts` so the declared
focused gate actually exercises this change. Additional helper tests also run
under the standing suite. Never change standing gates to avoid a failure.

Preserve the existing CLI/refusal history at base 474a385. No edits to earlier
graphs, notes, debriefs or receipts. No source comments under packages/*/src:
standing policy checks that. Use strict narrowing, no casts/non-null assertions.
This repository uses Biome; read scripts before formatting. Test fixtures must
keep their git ceiling and clean only their own disposable paths.

Write concise factual notes and a debrief beside this immutable brief. Map
acceptance to named assertions, distinguishing tests written from tests run.
Actual runtime is codex, model gpt-5.6-terra, high effort. Obtain graph base from
the generated brief, session start from initial HEAD, and head_sha from the last
code commit (not the later artifact commit). Commit the code and artifacts;
validate the debrief. Signed commits are unavailable in this sandbox: per-command
`git -c commit.gpgsign=false commit` is allowed and disclosed; do not touch keys
or global settings. Commit messages state why. No push, merge or service calls.
If a genuine outside-scope dependency remains, return it with evidence; stop
after this one node. Root, not your own pass report, runs acceptance review.
