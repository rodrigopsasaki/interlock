---
interlock: brief@v1
graph: 0009-delivery-boundary-proof
node: prove-storage-boundary
role: worker
gates: []
scope:
  - packages/ledger/src/sink.ts
  - packages/ledger/src/ledger.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/test/outboxDurability.test.ts
  - packages/ledger/test/replay.test.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/test/gateJudge.test.ts
  - packages/runner/test/absorbOutbox.failure.test.ts
  - packages/cli/src/schema/reference.ts
substrate:
  address: none
---

# Prove the storage half, not the whole delivery system

Read AGENTS.md and this graph's prove-storage-boundary acceptance. You own S1,
S2, S3 plus the two explicitly identified inherited gate repairs. The later
dispatch node owns D1-D5. Do not spend this session rediscovering their scope.
Write a concise S1/S2/S3→named-test map in notes first; finish those assertions,
not a substitute happy-path test. No additional agent or session.

Entry points: createLedgerSink currently directly calls node:fs writeFileSync
and fsyncSync. createLedger has an optional sink seam and appendConfirmed.
Use a small file-operation seam if needed to discriminate write from fsync;
one fake append exception with two labels does not prove either operation.
judgeGates→absorbThroughOutbox must see refusal before the counted dispatch.
retainOutboxArtifact currently calls mkdirSync outside its try block: test it.
readOutboxEvidence is the public verified lookup. Existing outboxDurability has
only guard and corrupt-lookup coverage, despite its name.

The inherited gateJudge fake clients still implement direct absorb. Update
prepared methods while keeping their original evidence/outcome assertions.
The last actual harness run failed seven such cases. Do not resurrect a direct
send fallback. The other failure was shape-reference freshness after worker
generation on Node26: use the pinned runtime for generate AND check; inspect
ordering if freshness still changes across invocations.

Run commands with `mise exec -- pnpm`; first record `mise exec -- node --version`
(expected24.14.0). The worker shell otherwise picks up Node26. This sandbox
cannot listen on localhost: leave HTTP-listener/full-suite gates to the harness,
do not retry EPERM or increase timeouts. Deterministic focused tests, typecheck,
lint, schema generation/check are available. All source stays strict/no comments.

Use actual UTC times and runtime codex/model gpt-5.6-terra. Initial generated
brief commit is session_start_sha, not graph_base_sha; final code commit is
head_sha. Keep valid typed notes/debrief and why-commits. Per-command unsigned
commit is allowed; no global changes. No service/key access, gates/old artifact
edits, push/merge or waiver. Commit all allowed work and stop. Explicitly list
any unmet S obligation; root reviews the real harness receipts independently.
