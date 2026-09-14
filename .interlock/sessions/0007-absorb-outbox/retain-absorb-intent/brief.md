---
interlock: brief@v1
graph: 0007-absorb-outbox
node: retain-absorb-intent
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
  - id: outbox-proof
    kind: command
    run: pnpm --filter runner --fail-if-no-match exec vitest run test/absorbOutbox.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: shape-reference-fresh
    kind: command
    run: pnpm interlock schema reference --check
scope:
  - AGENTS.md
  - docs/design/0001-interlock.md
  - packages/ledger/src/event.ts
  - packages/ledger/src/projection.ts
  - packages/ledger/src/envelope.ts
  - packages/ledger/src/ledger.ts
  - packages/ledger/src/sink.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/gateOutput.ts
  - packages/substrate/src/httpClient.ts
  - packages/substrate/src/client.ts
substrate:
  address: none
---

# Intent before absorb; doubt stays doubt

Read AGENTS.md, D8/I7 in design 0001 and the complete approved graph. The
runner-expanded file inventory does not enlarge acceptance. One fresh Terra/high
worker; no agents, approval, waiver, further session, live service, push or merge.

Root redirected slot 5 because preparing the real learning witness exposed a
direct send in gateJudge.absorbDebrief. The old outbox-intent-recorded event is
only a string and currently folds away. Implement the smallest genuine outbox
path for this one effect, with evidence the next graph can inspect. Do not build
a dispatcher, automatic reconciliation, retry daemon, metrics UI or new protocol.

Important existing behavior: full payloads contain measured receipt durations.
Hashing a newly regenerated payload as the sole delivery identity could turn
rejudgment timing noise into another send. Root chose logical identity bound to
target/repository + node/session + immutable debrief content, with the first exact
payload retained. A changed payload under that identity refuses as a conflict;
do not overwrite first evidence or silently re-dispatch. This intentionally
leaves reconciliation for a later explicit decision. Never claim exactly once.

The other trap is persistence: inspect installed Phyxius Journal's
notifySubscribers. It catches subscriber exceptions. Our appendFileSync sink is
a subscriber, and projection is another. A try/catch around today's ledger.append
alone is not proof intent reached disk. Establish a narrow reliable failure/
acknowledgment seam, preserve Phyxius and old readers, and test a real write
failure before the receiver can see a request. No trusted projection of a fact
whose persistence failed. Keep this finding in the bend log with a way back.
A possible narrow seam is appendConfirmed(event), where the sink confirms the
actual Phyxius entry ID after write and fsync, and persistence failure prevents
further confirmed dispatch until reopen. The implementation is yours; returning
success on enqueue, a swallowed subscriber exception or unsynced output is not
the contract. Include real write/sync failure and post-response ack-write failure.

Prepare the actual request at the adapter boundary, including the optional
repository from the preceding graph. Retain exact request and response evidence
with versioned safe refs under the shared journal. Never store auth/key contents.
Record acknowledgment only when its proof is retained; every potentially sent
but unconfirmed effect is uncertain. Replay never guesses or automatically sends.
Address none must remain useful and leave no empty fake outbox effect.

Use test/absorbOutbox.test.ts for representative real-runner/fake-HTTP acceptance
so the declared focused gate actually exercises this implementation. Existing
ledger/schema/CLI tests also stay intact. Verify old event@v1-v4 fixtures, add the
new version reader, regenerate docs via the existing command, and use strict
narrowing rather than casts. No packages/*/src comments or disabled gates.

Lesson from the preceding session: this worker sandbox denies local HTTP listen
with EPERM. Its capability tests then timeout, while root's harness runs the
same suite successfully. If this boundary occurs, do not retry listener tests,
raise timeouts or alter implementation to accommodate it. Validate types/format
and deterministic tests that can run here, name the limitation accurately, and
leave HTTP-dependent/full-suite proof to the harness. All seven prior sender
gates cleared there on c8a51b0, with verified retained output. A worker's inability
to run a gate is not the node's final harness verdict.

Keep concise source-rooted discoveries/decisions and an acceptance-to-test map.
Use actual runtime codex/model gpt-5.6-terra and generated graph-base/initial
session-start/last-code SHAs. Commit code and valid notes/debrief; signed commits
may use per-command commit.gpgsign=false, never global setting/key changes.
Return real limitations and stop after this graph's attempt.
