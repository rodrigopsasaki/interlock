---
interlock: brief@v1
graph: 0004-readable-refusals
node: honest-http-refusals
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
  - id: http-refusal-regressions
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test context.test.ts
      absorb.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
  - .interlock/graphs/0003-translator.yaml
  - .interlock/graphs/0004-readable-refusals.yaml
  - .interlock/graphs/readme-interlock-concept.yaml
  - .interlock/local.example.yaml
  - .interlock/sessions/0001-bootstrap/attempts/brief.md
  - .interlock/sessions/0001-bootstrap/attempts/debrief.yaml
  - .interlock/sessions/0001-bootstrap/attempts/notes.yaml
  - .interlock/sessions/0001-bootstrap/debrief-schema/brief.md
  - .interlock/sessions/0001-bootstrap/debrief-schema/debrief.yaml
  - .interlock/sessions/0001-bootstrap/debrief-schema/notes.yaml
  - .interlock/sessions/0001-bootstrap/face-read/brief.md
  - .interlock/sessions/0001-bootstrap/face-read/debrief.yaml
  - .interlock/sessions/0001-bootstrap/face-read/notes.yaml
  - .interlock/sessions/0001-bootstrap/face/brief.md
  - .interlock/sessions/0001-bootstrap/face/debrief.yaml
  - .interlock/sessions/0001-bootstrap/face/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/brief.md
  - .interlock/sessions/0001-bootstrap/ledger-gaps/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger/brief.md
  - .interlock/sessions/0001-bootstrap/ledger/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger/notes.yaml
  - .interlock/sessions/0001-bootstrap/position-model/brief.md
  - .interlock/sessions/0001-bootstrap/position-model/debrief.yaml
  - .interlock/sessions/0001-bootstrap/position-model/notes.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/brief.md
  - .interlock/sessions/0001-bootstrap/runner-command-gate/debrief.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/notes.yaml
  - .interlock/sessions/0001-bootstrap/scaffold/brief.md
  - .interlock/sessions/0001-bootstrap/scaffold/debrief.yaml
  - .interlock/sessions/0001-bootstrap/self-run/brief.md
  - .interlock/sessions/0001-bootstrap/self-run/debrief.yaml
  - .interlock/sessions/0001-bootstrap/self-run/notes.yaml
  - .interlock/sessions/0001-bootstrap/verbs/brief.md
  - .interlock/sessions/0001-bootstrap/verbs/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verbs/notes.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/brief.md
  - .interlock/sessions/0001-bootstrap/verifier-hunks/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/notes.yaml
  - .interlock/sessions/0002-shapes/brief-shape/brief.md
  - .interlock/sessions/0002-shapes/brief-shape/debrief.yaml
  - .interlock/sessions/0002-shapes/brief-shape/notes.yaml
  - .interlock/sessions/0002-shapes/schemas/brief.md
  - .interlock/sessions/0002-shapes/schemas/debrief.yaml
  - .interlock/sessions/0002-shapes/schemas/notes.yaml
  - .interlock/sessions/0002-shapes/shapes-reference/brief.md
  - .interlock/sessions/0002-shapes/shapes-reference/debrief.yaml
  - .interlock/sessions/0002-shapes/shapes-reference/notes.yaml
  - .interlock/sessions/0002-shapes/substrate-protocol/brief.md
  - .interlock/sessions/0002-shapes/substrate-protocol/debrief.yaml
  - .interlock/sessions/0002-shapes/substrate-protocol/notes.yaml
  - .interlock/sessions/0003-translator/evidence/brief.md
  - .interlock/sessions/0003-translator/evidence/debrief.yaml
  - .interlock/sessions/0003-translator/evidence/notes.yaml
  - .interlock/sessions/0003-translator/first-address/brief.md
  - .interlock/sessions/0003-translator/first-address/debrief.yaml
  - .interlock/sessions/0003-translator/first-address/notes.yaml
  - .interlock/sessions/0003-translator/interpreter/brief.md
  - .interlock/sessions/0003-translator/interpreter/debrief.yaml
  - .interlock/sessions/0003-translator/interpreter/notes.yaml
  - .interlock/sessions/0003-translator/substrate-client/brief.md
  - .interlock/sessions/0003-translator/substrate-client/debrief.yaml
  - .interlock/sessions/0003-translator/substrate-client/notes.yaml
  - .interlock/sessions/0004-readable-refusals/honest-http-refusals/brief.md
  - .interlock/sessions/readme-interlock-concept/readme/brief.md
  - .interlock/sessions/readme-interlock-concept/readme/debrief.yaml
  - .interlock/sessions/readme-interlock-concept/readme/notes.yaml
  - .node-version
  - AGENTS.md
  - LICENSE
  - NOTICE
  - README.md
  - biome.json
  - docs/brand/README.md
  - docs/brand/interlock-concept-dark.svg
  - docs/brand/interlock-concept-mobile-dark.svg
  - docs/brand/interlock-concept-mobile.svg
  - docs/brand/interlock-concept.svg
  - docs/brand/interlock-critical-path-dark.svg
  - docs/brand/interlock-critical-path-mobile-dark.svg
  - docs/brand/interlock-critical-path-mobile.svg
  - docs/brand/interlock-critical-path.svg
  - docs/brand/interlock-wordmark-dark.png
  - docs/brand/interlock-wordmark.png
  - docs/design/0001-interlock.md
  - docs/design/0002-face.md
  - docs/design/0003-substrate.md
  - docs/shapes.md
  - package.json
  - packages/cli/package.json
  - packages/cli/src/backfill.ts
  - packages/cli/src/bin.ts
  - packages/cli/src/brief/validate.ts
  - packages/cli/src/debrief/validate.ts
  - packages/cli/src/evidence.ts
  - packages/cli/src/face/dispatch.ts
  - packages/cli/src/face/focus.ts
  - packages/cli/src/face/keys.ts
  - packages/cli/src/face/run.ts
  - packages/cli/src/face/screen.ts
  - packages/cli/src/face/terminal.ts
  - packages/cli/src/face/world.ts
  - packages/cli/src/flags.ts
  - packages/cli/src/gate/clear.ts
  - packages/cli/src/gate/waive.ts
  - packages/cli/src/graph/approve.ts
  - packages/cli/src/graph/show.ts
  - packages/cli/src/graph/status.ts
  - packages/cli/src/herdrStatus.ts
  - packages/cli/src/judge.ts
  - packages/cli/src/legacyDebriefLine.ts
  - packages/cli/src/main.ts
  - packages/cli/src/node/cancel.ts
  - packages/cli/src/node/reset.ts
  - packages/cli/src/plan.ts
  - packages/cli/src/run.ts
  - packages/cli/src/schema/reference.ts
  - packages/cli/src/schema/validate.ts
  - packages/cli/src/session/show.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/evidence.test.ts
  - packages/cli/test/face/dispatch.test.ts
  - packages/cli/test/face/fixtures/fakeBin.ts
  - packages/cli/test/face/fixtures/manyLinesBin.ts
  - packages/cli/test/face/fixtures/verifier-hunks-journal.jsonl
  - packages/cli/test/face/focus.test.ts
  - packages/cli/test/face/keys.test.ts
  - packages/cli/test/face/nodeLevelKeys.test.ts
  - packages/cli/test/face/run.test.ts
  - packages/cli/test/face/world.test.ts
  - packages/cli/test/gate/clear.test.ts
  - packages/cli/test/gate/waive.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/graph/status.test.ts
  - packages/cli/test/herdrStatus.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/noComments.test.ts
  - packages/cli/test/noComments/fixtures/biomeIgnoreOnly.ts
  - packages/cli/test/noComments/fixtures/hasComment.ts
  - packages/cli/test/node/cancel.test.ts
  - packages/cli/test/node/reset.test.ts
  - packages/cli/test/plan.test.ts
  - packages/cli/test/run.test.ts
  - packages/cli/test/schema/reference.test.ts
  - packages/cli/test/schema/validate.test.ts
  - packages/cli/test/session/show.test.ts
  - packages/cli/test/sweep.test.ts
  - packages/cli/test/verify.test.ts
  - packages/cli/tsconfig.json
  - packages/cli/vitest.config.ts
  - packages/debrief/package.json
  - packages/debrief/src/brief.ts
  - packages/debrief/src/briefGate.ts
  - packages/debrief/src/briefScopePath.ts
  - packages/debrief/src/briefSubstrate.ts
  - packages/debrief/src/debrief.ts
  - packages/debrief/src/decision.ts
  - packages/debrief/src/discovery.ts
  - packages/debrief/src/gateRun.ts
  - packages/debrief/src/index.ts
  - packages/debrief/src/notes.ts
  - packages/debrief/src/paths.ts
  - packages/debrief/src/role.ts
  - packages/debrief/src/sha.ts
  - packages/debrief/src/slice.ts
  - packages/debrief/src/validate.ts
  - packages/debrief/test/brief.test.ts
  - packages/debrief/test/debrief.test.ts
  - packages/debrief/test/fixtures/brief-v1.md
  - packages/debrief/test/notes.test.ts
  - packages/debrief/test/slice.test.ts
  - packages/debrief/tsconfig.json
  - packages/debrief/vitest.config.ts
  - packages/face/package.json
  - packages/face/src/agentStatus.ts
  - packages/face/src/attempts.ts
  - packages/face/src/criticalPath.ts
  - packages/face/src/document.ts
  - packages/face/src/faceReducer.ts
  - packages/face/src/faceState.ts
  - packages/face/src/float.ts
  - packages/face/src/frameRender.ts
  - packages/face/src/graphs.ts
  - packages/face/src/helpText.ts
  - packages/face/src/index.ts
  - packages/face/src/leaseState.ts
  - packages/face/src/nodeRow.ts
  - packages/face/src/plansEntry.ts
  - packages/face/src/position.ts
  - packages/face/src/positionGate.ts
  - packages/face/src/receiptSummary.ts
  - packages/face/src/render.ts
  - packages/face/src/root.ts
  - packages/face/src/sessionColumns.ts
  - packages/face/src/topology.ts
  - packages/face/src/validate.ts
  - packages/face/src/verb.ts
  - packages/face/src/weight.ts
  - packages/face/test/approval.test.ts
  - packages/face/test/criticalPath.test.ts
  - packages/face/test/document.test.ts
  - packages/face/test/faceReducer.test.ts
  - packages/face/test/float.test.ts
  - packages/face/test/frameRender.test.ts
  - packages/face/test/noWriteSurface.test.ts
  - packages/face/test/position.test.ts
  - packages/face/test/render.test.ts
  - packages/face/test/root.test.ts
  - packages/face/test/topology.test.ts
  - packages/face/test/verb.test.ts
  - packages/face/test/weight.test.ts
  - packages/face/tsconfig.json
  - packages/face/vitest.config.ts
  - packages/ledger/package.json
  - packages/ledger/src/brief.ts
  - packages/ledger/src/debrief.ts
  - packages/ledger/src/derivation.ts
  - packages/ledger/src/disposition.ts
  - packages/ledger/src/envelope.ts
  - packages/ledger/src/event.ts
  - packages/ledger/src/expectOutput.ts
  - packages/ledger/src/gate.ts
  - packages/ledger/src/graph.ts
  - packages/ledger/src/index.ts
  - packages/ledger/src/lease.ts
  - packages/ledger/src/ledger.ts
  - packages/ledger/src/mandate.ts
  - packages/ledger/src/mark.ts
  - packages/ledger/src/note.ts
  - packages/ledger/src/outcome.ts
  - packages/ledger/src/projection.ts
  - packages/ledger/src/receipt.ts
  - packages/ledger/src/replay.ts
  - packages/ledger/src/session.ts
  - packages/ledger/src/sink.ts
  - packages/ledger/src/spend.ts
  - packages/ledger/src/upcast/v1.ts
  - packages/ledger/src/upcast/v2.ts
  - packages/ledger/src/upcast/v3.ts
  - packages/ledger/src/validate.ts
  - packages/ledger/test/derivation.test.ts
  - packages/ledger/test/expectOutput.test.ts
  - packages/ledger/test/fixtures/journal-v1-approved.jsonl
  - packages/ledger/test/fixtures/journal-v1-v2-2026-09-10.jsonl
  - packages/ledger/test/fixtures/journal-v3-v4-2026-09-11.jsonl
  - packages/ledger/test/gate.test.ts
  - packages/ledger/test/lease.test.ts
  - packages/ledger/test/mandate.test.ts
  - packages/ledger/test/note.test.ts
  - packages/ledger/test/outcome.test.ts
  - packages/ledger/test/projection.test.ts
  - packages/ledger/test/receipt.test.ts
  - packages/ledger/test/replay.test.ts
  - packages/ledger/test/spend.test.ts
  - packages/ledger/test/unrepresentable.test.ts
  - packages/ledger/test/wiring.test.ts
  - packages/ledger/tsconfig.json
  - packages/ledger/vitest.config.ts
  - packages/runner/package.json
  - packages/runner/src/backfill.ts
  - packages/runner/src/briefRewrite.ts
  - packages/runner/src/contextSlice.ts
  - packages/runner/src/dependencies.ts
  - packages/runner/src/gateCommand.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/herdr/adapter.ts
  - packages/runner/src/index.ts
  - packages/runner/src/interpreterBrief.ts
  - packages/runner/src/judgeWorktree.ts
  - packages/runner/src/lease.ts
  - packages/runner/src/localConfig.ts
  - packages/runner/src/narration.ts
  - packages/runner/src/openingPrompt.ts
  - packages/runner/src/runtime.ts
  - packages/runner/src/scope.ts
  - packages/runner/src/sessionBrief.ts
  - packages/runner/src/sessionDrive.ts
  - packages/runner/src/sessionScreen.ts
  - packages/runner/src/sessionWait.ts
  - packages/runner/src/standingGates.ts
  - packages/runner/src/startupAnswers.ts
  - packages/runner/src/sweep.ts
  - packages/runner/src/tmux/adapter.ts
  - packages/runner/src/validate.ts
  - packages/runner/src/worktree.ts
  - packages/runner/src/worktreeSetup.ts
  - packages/runner/test/adapterBoundary.test.ts
  - packages/runner/test/backfill.test.ts
  - packages/runner/test/briefRewrite.test.ts
  - packages/runner/test/fixtures/herdr-socket-schema.json
  - packages/runner/test/gateCommand.test.ts
  - packages/runner/test/gateJudge.test.ts
  - packages/runner/test/gitCeiling.test.ts
  - packages/runner/test/herdr/adapter.test.ts
  - packages/runner/test/herdr/fakeServer.ts
  - packages/runner/test/lease.test.ts
  - packages/runner/test/liveSmoke.test.ts
  - packages/runner/test/localConfig.test.ts
  - packages/runner/test/narration.test.ts
  - packages/runner/test/openingPrompt.test.ts
  - packages/runner/test/sessionBrief.test.ts
  - packages/runner/test/sessionScreen.test.ts
  - packages/runner/test/sessionWait.test.ts
  - packages/runner/test/standingGates.test.ts
  - packages/runner/test/support/gitFixture.ts
  - packages/runner/test/support/memoryLedger.ts
  - packages/runner/test/sweep.test.ts
  - packages/runner/test/tmux/adapter.test.ts
  - packages/runner/test/worktree.test.ts
  - packages/runner/test/worktreeSetup.test.ts
  - packages/runner/tsconfig.json
  - packages/runner/vitest.config.ts
  - packages/schemas/package.json
  - packages/schemas/src/frontMatter.ts
  - packages/schemas/src/index.ts
  - packages/schemas/src/reference.ts
  - packages/schemas/src/reference/artifacts.ts
  - packages/schemas/src/reference/corpus.ts
  - packages/schemas/src/reference/describe.ts
  - packages/schemas/src/reference/diff.ts
  - packages/schemas/src/reference/fence.ts
  - packages/schemas/src/reference/fields.ts
  - packages/schemas/src/reference/json.ts
  - packages/schemas/src/reference/render.ts
  - packages/schemas/src/reference/schemaFiles.ts
  - packages/schemas/src/reference/vocabulary.ts
  - packages/schemas/src/registry.ts
  - packages/schemas/src/validate.ts
  - packages/schemas/test/corpus.files.test.ts
  - packages/schemas/test/corpus.guards.test.ts
  - packages/schemas/test/corpus.item.test.ts
  - packages/schemas/test/corpus.journal.test.ts
  - packages/schemas/test/corpus.position.test.ts
  - packages/schemas/test/corpus.substrate.test.ts
  - packages/schemas/test/reference.test.ts
  - packages/schemas/test/registry.test.ts
  - packages/schemas/tsconfig.json
  - packages/schemas/vitest.config.ts
  - packages/substrate/package.json
  - packages/substrate/src/address.ts
  - packages/substrate/src/client.ts
  - packages/substrate/src/derivationString.ts
  - packages/substrate/src/discoveryKind.ts
  - packages/substrate/src/evidence.ts
  - packages/substrate/src/httpClient.ts
  - packages/substrate/src/index.ts
  - packages/substrate/src/keyFile.ts
  - packages/substrate/src/narrate.ts
  - packages/substrate/src/noneClient.ts
  - packages/substrate/src/registry.ts
  - packages/substrate/src/sliceCount.ts
  - packages/substrate/src/validate.ts
  - packages/substrate/src/wire.ts
  - packages/substrate/test/absorb.test.ts
  - packages/substrate/test/address.test.ts
  - packages/substrate/test/capabilities.test.ts
  - packages/substrate/test/context.test.ts
  - packages/substrate/test/derivationString.test.ts
  - packages/substrate/test/discoveryKind.test.ts
  - packages/substrate/test/evidence.test.ts
  - packages/substrate/test/keyFile.test.ts
  - packages/substrate/test/noneClient.test.ts
  - packages/substrate/test/sliceCount.test.ts
  - packages/substrate/test/support/fakeSubstrateServer.ts
  - packages/substrate/test/support/fixtures.ts
  - packages/substrate/test/wire.test.ts
  - packages/substrate/tsconfig.json
  - packages/substrate/vitest.config.ts
  - packages/verifier/package.json
  - packages/verifier/src/foundAt.ts
  - packages/verifier/src/git.ts
  - packages/verifier/src/hunkCitation.ts
  - packages/verifier/src/index.ts
  - packages/verifier/src/inverse.ts
  - packages/verifier/src/render.ts
  - packages/verifier/src/verify.ts
  - packages/verifier/src/vocabulary.ts
  - packages/verifier/test/foundAt.test.ts
  - packages/verifier/test/git.test.ts
  - packages/verifier/test/hunkCitation.test.ts
  - packages/verifier/test/inverse.test.ts
  - packages/verifier/test/render.test.ts
  - packages/verifier/test/support/gitFixture.ts
  - packages/verifier/test/verify.test.ts
  - packages/verifier/test/vocabulary.test.ts
  - packages/verifier/tsconfig.json
  - packages/verifier/vitest.config.ts
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - schemas/brief@v0.json
  - schemas/brief@v1.json
  - schemas/config@v0.json
  - schemas/debrief@v0.json
  - schemas/debrief@v1.json
  - schemas/debrief@v2.json
  - schemas/event@v1.json
  - schemas/event@v2.json
  - schemas/event@v3.json
  - schemas/event@v4.json
  - schemas/graph@v0.json
  - schemas/item@v1.json
  - schemas/local@v0.json
  - schemas/notes@v0.json
  - schemas/parts/debrief-derivation.json
  - schemas/parts/debrief-event.json
  - schemas/parts/decision.json
  - schemas/parts/derivation.json
  - schemas/parts/discovery.json
  - schemas/parts/disposition.json
  - schemas/parts/duration.json
  - schemas/parts/gap.json
  - schemas/parts/gate-declaration.json
  - schemas/parts/gate-run.json
  - schemas/parts/gate-v1.json
  - schemas/parts/gate.json
  - schemas/parts/held-on.json
  - schemas/parts/lease.json
  - schemas/parts/legacy-decision.json
  - schemas/parts/legacy-discovery.json
  - schemas/parts/legacy-gate-run.json
  - schemas/parts/mark.json
  - schemas/parts/node.json
  - schemas/parts/note.json
  - schemas/parts/outcome-v1.json
  - schemas/parts/outcome.json
  - schemas/parts/receipt-v1.json
  - schemas/parts/receipt.json
  - schemas/parts/session-brief.json
  - schemas/parts/session.json
  - schemas/parts/spend.json
  - schemas/parts/standing-gate.json
  - schemas/parts/startup-answer.json
  - schemas/position@v1.json
  - schemas/substrate/absorb.request.json
  - schemas/substrate/absorb.response.json
  - schemas/substrate/capabilities.response.json
  - schemas/substrate/close.request.json
  - schemas/substrate/close.response.json
  - schemas/substrate/consult.request.json
  - schemas/substrate/consult.response.json
  - schemas/substrate/contest.request.json
  - schemas/substrate/contest.response.json
  - schemas/substrate/context.request.json
  - schemas/substrate/context.response.json
  - schemas/substrate/judge.request.json
  - schemas/substrate/judge.response.json
  - schemas/substrate/note.request.json
  - schemas/substrate/note.response.json
  - schemas/substrate/open.request.json
  - schemas/substrate/open.response.json
  - schemas/substrate/propose.request.json
  - schemas/substrate/propose.response.json
  - schemas/substrate/query.request.json
  - schemas/substrate/query.response.json
  - schemas/substrate/ratify.request.json
  - schemas/substrate/ratify.response.json
  - schemas/substrate/why.request.json
  - schemas/substrate/why.response.json
  - scripts/check-readme.ts
  - scripts/noComments.ts
  - tsconfig.json
  - vitest.config.base.ts
  - vitest.setup.ts
substrate:
  address: none
graph_base_sha: d1bce7455c294d70c7e58b78ffb268270bb8dd73
session: a99b0f0e-1e1b-43cc-9819-e2b6769931f8
---

# Brief · readable HTTP refusals

## Acceptance

> A non-2xx response received for context or absorb remains a refused outcome
> naming its verb and exact HTTP status, with a useful bounded body explanation
> when available. Recognize a JSON error.message string, a JSON error string,
> or plain text; do not serialize arbitrary JSON objects as an explanation.
> Limit error-body consumption to 1024 bytes and displayed detail to 512
> characters, normalize control characters, and indicate truncation. Empty,
> unreadable, unrecognized, or malformed structured bodies still retain the
> received status, never becoming a claim that no response arrived. Never
> copy headers into the explanation, and redact the configured bearer token
> if the server echoes it. Successful responses and address-none behavior
> remain unchanged. Network and abort failures remain distinguishable from
> received HTTP failures. Tests use only a local fake server and prove both
> verbs, the supported body forms, empty and malformed bodies, truncation,
> echoed-token redaction, and existing success/network behavior. A targeted
> regression fails against the old client. The session commits its notes and
> versioned debrief with references to its changed files; the harness, not the
> worker, executes the declared and standing gates.

## Read first

1. `AGENTS.md`, especially I1, I5, I7, I8, and the strict TypeScript and no-comments conventions. The refusal is a narration of what the harness received; it must not invent a lost connection or disclose an effect's credentials.
2. `packages/substrate/src/httpClient.ts`. `call` currently returns on non-2xx before reading the response body; keep the successful-response and transport paths separate.
3. `packages/substrate/test/context.test.ts`, `packages/substrate/test/absorb.test.ts`, and `packages/substrate/test/support/fakeSubstrateServer.ts`. These are the local HTTP seam for both verbs. Extend the fake only as needed to express declared media and raw bounded bodies.
4. `packages/substrate/src/narrate.ts` and `packages/substrate/src/client.ts`. Preserve the existing refused outcome and its context/absorb narration contract; do not add a second outcome kind.

## Intended touch scope

The expected code and tests are the four scoped paths in the front matter. A small helper under `packages/substrate/src/` is permitted only if it keeps response-detail handling out of the client flow and remains covered by the targeted tests. Do not change schemas, protocol versions, runner waits, graph files, local configuration, capabilities, evidence translation, or the face. Do not call a live address or any external API.

## Detail boundary

The 1024-byte intake limit and 512-character rendered-detail limit are distinct: collect no more than the byte limit from a received non-2xx body, then render no more than the character limit after selecting and normalizing its supported explanation. Mark either kind of truncation truthfully. A body-reader error or reader cancellation after the HTTP response exists retains that response's verb and exact status, with no body detail if none was safely read.

Use declared media distinctions: JSON media may yield only `error.message` or `error` when each is a string; plain-text media may yield its text; empty, malformed, unknown-media, or JSON-object bodies yield status without arbitrary object serialization. Remove terminal control characters before rendering. Never inspect, copy, or narrate headers.

If a configured bearer token appears in eligible detail, redact that exact configured value before it can be rendered. Preserve enough matching state across chunks and the collection boundary that an intake or display cut through a prefix of that same configured value cannot emit the prefix; omit that trailing prefix rather than guessing at any other secret. Do not claim to recognize or redact unconfigured secrets.

## Working record and proof

Before authoring records, read `schemas/debrief@v2.json`, its referenced part schemas, and `schemas/notes@v0.json`. Validate with `mise exec -- pnpm interlock debrief validate 0004-readable-refusals honest-http-refusals` before the final record commit. Do not launch another agent, switch models, or alter your brief; the orchestrator owns delegation. The runner's brief commit is harness-authored, not your implementation.

This session is the only writable harness record: append `notes@v0` choices or surprises incrementally under `.interlock/sessions/0004-readable-refusals/honest-http-refusals/`; do not alter another session's records. Finish with a committed `debrief@v2`, not a drafted or overwritten debrief. Its derivation must name the actual runtime and model that performed this work, not the graph producer or an earlier author. Each decision cites every changed file it rests on; its graph-base SHA comes from runner front matter, its session-start SHA is HEAD before work, and its head SHA is the last code commit rather than the debrief's own commit.

Run any local checks through `mise exec -- pnpm ...` if useful, but agent-reported results are not proof. The harness runs the declared and standing gates. Commit messages state why with a body explaining the boundary and tradeoff. Do not push, merge, waive, alter approval, edit this graph or configuration, clean worktrees, or use `/tmp`; use an ignored directory local to the worktree for scratch work. Make the smallest implementation that meets the acceptance. If the scoped seam cannot express it or the acceptance conflicts with the graph, record the surprise and return a held position for the person.
