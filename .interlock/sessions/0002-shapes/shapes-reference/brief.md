---
interlock: brief@v1
graph: 0002-shapes
node: shapes-reference
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: reference-fresh
    kind: command
    run: pnpm --filter schemas --fail-if-no-match test --testNamePattern reference
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
  - .interlock/graphs/0003-translator.yaml
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
  - .interlock/sessions/0002-shapes/substrate-protocol/brief.md
  - .interlock/sessions/readme-interlock-concept/readme/brief.md
  - .interlock/sessions/readme-interlock-concept/readme/notes.yaml
  - .node-version
  - AGENTS.md
  - LICENSE
  - NOTICE
  - README.md
  - docs/brand/README.md
  - docs/brand/interlock-concept-mobile.svg
  - docs/brand/interlock-concept.svg
  - docs/brand/interlock-critical-path.svg
  - docs/brand/interlock-wordmark.png
  - docs/design/0001-interlock.md
  - docs/design/0002-face.md
  - docs/design/0003-substrate.md
  - package.json
  - packages/cli/package.json
  - packages/cli/src/backfill.ts
  - packages/cli/src/bin.ts
  - packages/cli/src/brief/validate.ts
  - packages/cli/src/debrief/validate.ts
  - packages/cli/src/face/dispatch.ts
  - packages/cli/src/face/focus.ts
  - packages/cli/src/face/keys.ts
  - packages/cli/src/face/run.ts
  - packages/cli/src/face/screen.ts
  - packages/cli/src/face/terminal.ts
  - packages/cli/src/face/world.ts
  - packages/cli/src/flags.ts
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
  - packages/cli/src/run.ts
  - packages/cli/src/schema/validate.ts
  - packages/cli/src/session/show.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/face/dispatch.test.ts
  - packages/cli/test/face/fixtures/fakeBin.ts
  - packages/cli/test/face/fixtures/manyLinesBin.ts
  - packages/cli/test/face/fixtures/verifier-hunks-journal.jsonl
  - packages/cli/test/face/focus.test.ts
  - packages/cli/test/face/keys.test.ts
  - packages/cli/test/face/nodeLevelKeys.test.ts
  - packages/cli/test/face/run.test.ts
  - packages/cli/test/face/world.test.ts
  - packages/cli/test/gate/waive.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/graph/status.test.ts
  - packages/cli/test/herdrStatus.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/node/cancel.test.ts
  - packages/cli/test/node/reset.test.ts
  - packages/cli/test/run.test.ts
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
  - packages/runner/src/dependencies.ts
  - packages/runner/src/gateCommand.ts
  - packages/runner/src/gateJudge.ts
  - packages/runner/src/herdr/adapter.ts
  - packages/runner/src/index.ts
  - packages/runner/src/judgeWorktree.ts
  - packages/runner/src/lease.ts
  - packages/runner/src/localConfig.ts
  - packages/runner/src/narration.ts
  - packages/runner/src/openingPrompt.ts
  - packages/runner/src/runtime.ts
  - packages/runner/src/scope.ts
  - packages/runner/src/sessionBrief.ts
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
  - packages/schemas/src/registry.ts
  - packages/schemas/src/validate.ts
  - packages/schemas/test/corpus.files.test.ts
  - packages/schemas/test/corpus.guards.test.ts
  - packages/schemas/test/corpus.item.test.ts
  - packages/schemas/test/corpus.journal.test.ts
  - packages/schemas/test/corpus.position.test.ts
  - packages/schemas/test/registry.test.ts
  - packages/schemas/tsconfig.json
  - packages/schemas/vitest.config.ts
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
  - scripts/check-readme.ts
  - tsconfig.json
  - vitest.config.base.ts
  - vitest.setup.ts
substrate:
  address: none
graph_base_sha: 65ec684b7e067ff57423dfafc95b745a78eb6d8e
session: 50afd67f-efa7-41f6-a8b1-23f84bf6ae73
---

# Brief · node `shapes-reference` · graph `0002-shapes`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0002-shapes`, approved by a receipt in the repository's shared journal. Do not edit
  any graph file.
- **node:** `shapes-reference`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `schemas`, cleared: the schemas under `schemas/` and `packages/schemas` exist.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> `docs/shapes.md`, generated from the schemas by a script the standing gates run, one section
> per artifact: its purpose in one sentence from the vocabulary, its versions and what changed
> between them, its fields with types and whether required, and one real example taken from
> the corpus. Regenerating it changes nothing when the schemas have not changed, and the test
> fails when it is stale.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: the vocabulary table (the one-sentence purposes come from here, never invented),
   Compatibility, Constraints.
2. `schemas/` and `packages/schemas` as `schemas` left them, and that node's debrief beside this
   one under `.interlock/sessions/0002-shapes/schemas/`.
3. `README.md` and `docs/design/0001-interlock.md`'s Compatibility section, for the register the
   generated page must match: plain, no marketing, the repository's own voice.
4. The corpus under `.interlock/` and the journal fixture the schemas package holds, for the
   examples.

## What this node builds

- **A generator**, `packages/schemas/src/reference.ts`, exposed as `interlock schema reference
  [--check]`: reads every schema under `schemas/`, groups files by artifact (`event`, `debrief`,
  `brief`, …), and writes `docs/shapes.md` deterministically: stable order, stable formatting,
  no timestamps, so a second run over unchanged schemas is byte-identical. Per artifact, in
  this order: the purpose sentence taken from the vocabulary table by the artifact's term (a
  term missing from the table is a sentence in the output and a finding in the debrief, never a
  coinage); its versions, oldest first, each with what changed since the previous one, derived by
  diffing the schemas' properties (added, removed, made optional, retyped) and stated in words;
  a field table per current version with type, required or optional, and the schema's
  description; one real example per version, the first file in the corpus that carries that tag,
  quoted verbatim and trimmed to the example's own artifact.
- **The freshness test**, named so the gate finds it (`reference`): regenerates into memory and
  asserts byte equality with the committed `docs/shapes.md`; `--check` does the same from the
  CLI and exits non-zero with the first differing line. The standing `test` gate therefore fails
  when the page is stale, which is what the acceptance means by a script the standing gates run.
- **The page itself**, committed, generated by the script and never edited by hand; a line at the
  top says which command regenerates it.

## Out of scope

Editing any schema (a schema that is wrong is a finding for `open`); the substrate payload
schemas; any design note. Do not edit `AGENTS.md`, any design note, any graph,
`.interlock/config.yaml`, this brief, or any other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. Never quote `AGENTS.md`, this brief or a design note inside code; the generator reads
  the vocabulary table at run time instead.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, no `git reset --hard`, no `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the section list of the generated page and every vocabulary term the generator
   could not find in the table.

When the debrief is committed, stop and wait. The runner judges from there.
