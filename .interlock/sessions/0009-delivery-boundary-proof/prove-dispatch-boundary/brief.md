---
interlock: brief@v1
graph: 0009-delivery-boundary-proof
node: prove-dispatch-boundary
role: worker
gates: []
scope:
  - packages/runner/src/gateJudge.ts
  - packages/runner/test/absorbOutbox.test.ts
  - packages/runner/test/absorbOutbox.failure.test.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/src/sink.ts
  - packages/substrate/src/httpClient.ts
  - packages/substrate/test/absorb.test.ts
substrate:
  address: none
---

# Prove the dispatch half

Read AGENTS.md and this graph's D1-D5 acceptance. The prior node owns storage
proof. Use its production seams, do not duplicate persistence or the outbox.
Save D1-D5→named-test map in notes before code; implement every discriminating
branch in the map. Existing three tests are a floor, not complete acceptance.
Use real ledger reopen and actual HTTP adapter with injected fetch/transport;
no listener is required for most tests. Count dispatches and inspect retained
evidence, not merely returned strings. Treat an observed response followed by
persistence failure as doubt in the live read. Reopen may recover a complete
acknowledgment record whose already-retained response verifies: that is evidence,
not guessing. Test separately the missing record (uncertain) and a complete
record surviving fsync failure (verify evidence before reporting acknowledgment).
Neither may resend. Public delivery claims use readOutboxEvidence, not an
unchecked projection label. No WAL redesign is called for. New retries are not
your decision.

Use `mise exec -- pnpm` (Node24.14.0). The sandbox's default Node is26 and local
listeners are denied: leave listener/full-suite gates to the harness, no repeated
EPERM attempts. Keep S1-S3 regressions and existing readable JSON/plain-text
refusal assertions. No new dependency or broad dispatcher. No other agents,
services, credentials, graph/old artifact edits, push/merge or waiver.

Use actual observed UTC, codex/gpt-5.6-terra, graph-base from generated brief,
initial generated brief commit as session-start, last-code commit as head SHA.
Commit code, valid notes and debrief with exact D1-D5 test refs; mark any unmet
obligation explicitly, then stop for root's independent proof review.
