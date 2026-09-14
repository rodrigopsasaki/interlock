---
interlock: brief@v1
graph: 0010-learning-transfer
node: source-diagnosis
role: worker
gates: []
scope:
  - packages/substrate/src/evidence.ts
  - packages/substrate/src/derivationString.ts
  - packages/verifier/src/verify.ts
  - packages/substrate/test/evidence.test.ts
substrate:
  address: none
---

# Diagnose the evidence boundary

Read AGENTS.md, this graph's source-diagnosis acceptance and current source.
Produce docs/experiments/learning-transfer/diagnosis.md: a concise source-cited
account of what a test designer must understand, with useful directions and
explicit limits. Do not seek a predetermined defect or invent a discovery.
Genuine discoveries must cite actual source in found_at, not merely your report.
Do not read earlier session artifacts or sibling worktrees.

Only the new report and your own notes/debrief are editable. No code fixes,
tests, services, other agents or manual substrate calls. The harness owns gates,
verification and delivery. Use mise exec -- pnpm (pinned Node24.14.0); the shell
default is26. Local listeners are denied; don't retry EPERM or inflate timeouts.
Source reading and artifact validation suffice; the harness runs standing tests.

Record actual UTC from a clock. Use runtime codex/model gpt-5.6-terra, generated
graph_base_sha, initial generated brief commit as session_start_sha, and last
report commit as head_sha. Validate your debrief with the local CLI. Conventional
why-commits; per-command commit.gpgsign=false is allowed, no global changes.
Commit report and truthful typed notes/debrief, then stop.

## Context slice

The harness may supply retrieved context here. Absence remains absence.
