---
interlock: brief@v1
graph: 0012-delivery-read
node: read-session-delivery
role: worker
gates: []
scope:
  - packages/cli/src/evidence.ts
  - packages/cli/src/main.ts
  - packages/cli/test/evidence.test.ts
  - packages/ledger/src/outbox.ts
  - packages/ledger/src/projection.ts
  - docs/shapes.md
substrate:
  address: none
---

# Read delivery from retained evidence

Read AGENTS.md, docs/design/0001-interlock.md and this node's graph acceptance.
The graph acceptance is the bounded contract; this brief names entry points.
Before code, append a short acceptance-to-assertion map in your notes.
Start with CLI evidence.ts session selection, existing replay and public
readOutboxEvidence. The opt-in path is evidence G N --delivery [--session S].
Default output must remain byte-for-byte compatible. Use current persisted
outbox intents filtered to that exact node/session, not current config or
a reconstructed payload from receipts. A tiny CLI formatter/helper is fine;
ledger/schema/production substrate changes are outside this node.

An intent must be readable even before debrief or outcome exists: branch after exact
session selection, before the existing ordinary judged-session guard. Test
that crash state with a real retained intent and no debrief/outcome.
Only verified retained acknowledgment evidence earns acknowledged. Intent
without delivery or explicit uncertain stays uncertain. Distinguish no
recorded effect, missing bytes and corrupt bytes; never turn absence into
a historical no-address or no-receiver-action claim. No dispatch/retry/
reconcile and no mutation. No request/ack payloads, target/origin URLs,
because strings or secret-bearing content printed: safe artifact refs,
effect IDs, session and truthful state suffice.

Real retained artifact tests, not fake reader responses, must distinguish
acknowledged, intent-only, explicit uncertain, no effect, no selected session,
missing/corrupt request and acknowledgment, exact session/node isolation,
latest-session default, and ordinary command output unchanged. Inject
sentinel secrets in payloads/target/because and prove none appear in output.
Unknown/session options should fail usefully without changing ordinary
legacy behavior. Keep existing diagnostics; no invented usefulness score.

## Environment and completion

Use mise exec -- pnpm, Node24.14.0. The default shell Node is26.
Local listeners/process inspection can be denied; do not retry EPERM,
increase timeouts or invent workarounds. Deterministic focused tests are fine;
the harness runs standing gates. No new dependencies, other agents, external
services, graph/brief edits, prior-session artifact edits, gate waivers,
push, main/remote merge or global configuration changes.

Read current source/tests rather than other sessions for artifact examples.
For artifact shapes, use schemas/notes@v0.json and schemas/debrief@v2.json
and current debrief reader. Read only your own notes/debrief as they appear.
Every choice and surprise gets actual UTC from a clock, not an estimated time.
Record runtime codex/model gpt-5.6-terra. graph_base_sha comes from the
generated brief; session_start_sha is its initial commit. head_sha is the
last implementation commit before final artifacts, not an invented HEAD.
Use Conventional why-commits; per-command commit.gpgsign=false is allowed.

Write final artifact content, then run the existing CLI schema reference
generator and --check in this node worktree. Do not hand-edit docs/shapes.md,
run the generator against a controller's ignored local state, or change
artifacts again without regenerating. Final debrief says which acceptance
is met or unmet and cites actual proof limitations. Commit and stop.

## Context slice

No substrate address is required for this implementation. Absence is valid.
