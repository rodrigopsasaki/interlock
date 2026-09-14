---
interlock: brief@v1
graph: 0008-learning-witness
node: prove-delivery
role: worker
gates: []
scope:
  - packages/runner/src/gateJudge.ts
  - packages/runner/test/absorbOutbox.test.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/src/ledger.ts
  - packages/ledger/src/sink.ts
  - packages/substrate/src/httpClient.ts
  - packages/substrate/src/responseDetail.ts
substrate:
  address: none
---

# Finish delivery acceptance before a learning trial

Read AGENTS.md, I7/design D8 and the complete graph's prove-delivery acceptance.
This is a new bounded repair node on the held slot-5 candidate, not a continuation
of that session. The next nodes stay blocked if you cannot establish this proof.
Do not touch their source briefs or task artifacts. No extra sessions/subagents.

Concrete harness result from slot 5: capabilities passed; absorb.test.ts failed
two existing readable-refusal assertions because dispatch now returns only
"absorb returned HTTP 409/413". Compose the existing bounded/redacted helper so
the prior useful detail survives while effect state stays uncertain. Do not
weaken those expected assertions. docs/shapes.md was stale at line 882. The
worker's sandbox explanation did not explain these later harness failures.

The earlier outbox test proves one happy path. Its write/sync tests merely throw
from the same fake sink with different labels; they do not prove real fsync
failure or zero HTTP in the actual runner. This graph explicitly requires the
failure/restart/identity/none/secret/ref matrix, at the actual production seams.
Keep Phyxius. Small injectible fs operations or a real filesystem failure are
fine; no generic dispatcher or retry/reconciliation system. Preserve old readers
and immutable original evidence. Treat the graph's acceptance as a checklist,
and map each obligation to a running test/assertion in your debrief. Missing
proof is missing, even if a one-test focused gate passes.

Final review also found a concrete invalid state: acknowledged delivery permits
no acknowledgment artifact in the type, guard and schema. Fix all three. Match
runtime SHA-256 ID/byte-count constraints to their schemas. Add a tiny verified
lookup by node/session/effect for the witness, and real v4 coverage (the old
v3-v4-named fixture has zero v4 lines). These are included in the graph, not
optional polish or grounds for a broader API redesign.

The current client exposes prepared methods optionally. Missing preparation
must refuse, never dispatch or pretend success. If existing runner/CLI fakes
break, adapt them through prepared transport behavior within the same contract;
do not restore a direct-send fallback. Other prior assertions remain useful.

This worker sandbox blocks local listeners. Do deterministic failure injection,
type/format/shape checks here; leave listener-dependent and full-suite execution
to the harness if EPERM appears. Do not repeat blocked attempts, raise timeouts,
or mistake your local failure for the harness verdict. Local install is already
prepared. No live receiver/brain/key access or substrate calls. Root runs this
prerequisite with substrate none. No push, merge, waiver, history rewrite or
unrelated refactor. Only approved files and your own new notes/debrief.

Use actual clock-observed UTC, not invented timestamps. Runtime codex/model
gpt-5.6-terra. session_start_sha is your generated initial HEAD, not graph base;
read it before edits. Preserve prior debriefs and explain contradictions in your
own note. Per-command commit.gpgsign=false is allowed if signing is unavailable.
Commit code and validated artifacts; accurately list remaining obligations and
stop. The orchestrator will independently review before any trial runs.

## Context slice

No substrate is addressed for this prerequisite.
