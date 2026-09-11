---
interlock: brief@v1
graph: 0001-bootstrap
node: attempts
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
  - id: narration-events
    kind: command
    run: pnpm --filter ledger --fail-if-no-match test --testNamePattern narrat
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
  - .interlock/local.example.yaml
  - .interlock/sessions/0001-bootstrap/attempts/brief.md
  - .interlock/sessions/0001-bootstrap/debrief-schema/brief.md
  - .interlock/sessions/0001-bootstrap/debrief-schema/debrief.yaml
  - .interlock/sessions/0001-bootstrap/debrief-schema/notes.yaml
  - .interlock/sessions/0001-bootstrap/face-read/brief.md
  - .interlock/sessions/0001-bootstrap/face-read/debrief.yaml
  - .interlock/sessions/0001-bootstrap/face-read/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/brief.md
  - .interlock/sessions/0001-bootstrap/ledger-gaps/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger-gaps/notes.yaml
  - .interlock/sessions/0001-bootstrap/ledger/brief.md
  - .interlock/sessions/0001-bootstrap/ledger/debrief.yaml
  - .interlock/sessions/0001-bootstrap/ledger/notes.yaml
  - .interlock/sessions/0001-bootstrap/position-model/brief.md
  - .interlock/sessions/0001-bootstrap/runner-command-gate/brief.md
  - .interlock/sessions/0001-bootstrap/runner-command-gate/debrief.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/notes.yaml
  - .interlock/sessions/0001-bootstrap/scaffold/brief.md
  - .interlock/sessions/0001-bootstrap/scaffold/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verbs/brief.md
  - .interlock/sessions/0001-bootstrap/verifier-hunks/brief.md
  - .interlock/sessions/0001-bootstrap/verifier-hunks/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/notes.yaml
  - .interlock/sessions/0002-shapes/brief-shape/brief.md
  - .interlock/sessions/0002-shapes/brief-shape/debrief.yaml
  - .interlock/sessions/0002-shapes/brief-shape/notes.yaml
  - .node-version
  - AGENTS.md
  - LICENSE
  - NOTICE
  - README.md
  - docs/design/0001-interlock.md
  - docs/design/0002-face.md
  - docs/design/0003-substrate.md
  - package.json
  - packages/cli/package.json
  - packages/cli/src/backfill.ts
  - packages/cli/src/bin.ts
  - packages/cli/src/brief/validate.ts
  - packages/cli/src/debrief/validate.ts
  - packages/cli/src/graph/approve.ts
  - packages/cli/src/graph/show.ts
  - packages/cli/src/judge.ts
  - packages/cli/src/main.ts
  - packages/cli/src/run.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/run.test.ts
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
  - packages/face/src/criticalPath.ts
  - packages/face/src/document.ts
  - packages/face/src/index.ts
  - packages/face/src/position.ts
  - packages/face/src/render.ts
  - packages/face/src/root.ts
  - packages/face/src/topology.ts
  - packages/face/src/validate.ts
  - packages/face/test/approval.test.ts
  - packages/face/test/criticalPath.test.ts
  - packages/face/test/document.test.ts
  - packages/face/test/position.test.ts
  - packages/face/test/render.test.ts
  - packages/face/test/root.test.ts
  - packages/face/test/topology.test.ts
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
  - packages/ledger/src/validate.ts
  - packages/ledger/test/derivation.test.ts
  - packages/ledger/test/expectOutput.test.ts
  - packages/ledger/test/fixtures/journal-v1-approved.jsonl
  - packages/ledger/test/fixtures/journal-v1-v2-2026-09-10.jsonl
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
  - packages/runner/test/herdr/adapter.test.ts
  - packages/runner/test/herdr/fakeServer.ts
  - packages/runner/test/lease.test.ts
  - packages/runner/test/liveSmoke.test.ts
  - packages/runner/test/localConfig.test.ts
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
  - tsconfig.json
  - vitest.config.base.ts
substrate:
  address: none
graph_base_sha: e551ae699c64ec4c2f6798976a519027ceed624e
session: 485f21a3-ffc2-43e4-a9bd-48939785e81f
---

# Brief · node `attempts` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, approved by a receipt in the repository's shared journal. Do not
  edit any graph file.
- **node:** `attempts`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runner-command-gate` and `debrief-schema`, both cleared.
- **how this session runs:** `interlock run` leased this node, created or resumed this worktree,
  committed this brief into it, started you in a herdr pane and will judge the gates when you stop.
  The graph base SHA and the session id are in the front matter the runner wrote above.

## Acceptance (verbatim from the graph)

> Every attempt of a node is legible from the journal alone. Each line the runner or the judge
> narrates about a session is an event on that session with its wall time, so a face can tell an
> attempt's story without a log file. Every session the ledger knows has a session view, including
> the ones backfill records: backfill writes the session from the session directory's brief and
> ingests a `debrief@v2` when one is there. `interlock session show <graph> <node> [--session <id>]`
> prints a session's five columns, its notes and its narration, latest session by default. The
> persisted shape moves to the next event version with an upcaster; the real journal replays under
> it without loss.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: vocabulary, Compatibility, Constraints.
2. `docs/design/0001-interlock.md`: The session drilldown (the five columns), Node lifecycle, D5,
   D26, and the bend log's 2026-09-10 rows. `docs/design/0002-face.md`: D14 (the face reads the
   journal and the graph file, nothing else) and the Views table.
3. `packages/ledger/src/event.ts`, `envelope.ts`, `upcast/v1.ts`, `upcast/v2.ts`, `projection.ts`
   (`SessionView`), `session.ts`, `brief.ts`. The journal is `interlock: event@v3`; the pattern for
   moving it is the v2 upcaster and its test over the real journal fixture.
4. `packages/cli/src/run.ts` (every `narrate(...)` call), `packages/cli/src/judge.ts`,
   `packages/runner/src/backfill.ts` and `judgeWorktree.ts`, `packages/runner/src/sessionBrief.ts`
   (`buildBrief`), `packages/debrief/src` (the brief, notes and debrief readers).
5. The session directories under `.interlock/sessions/`: seven cleared nodes with briefs at v0 or
   v1 and debriefs at v0, v1 or v2. Backfill will have to record a session for each.

## What this node builds

- **`session-narrated`.** A new event kind `{ kind: "session-narrated", session, at, line }` where
  `at` is wall milliseconds from the clock the ledger already receives. `interlock run` appends one
  for every line it narrates once the session exists in the journal; lines before that are only
  printed, and you record where that boundary falls. `interlock judge` appends its lines on the
  session it judges. The persisted envelope becomes `event@v4`; `event@v3` upcasts through a
  superset check the way v2 does; the real journal fixture (copy the current
  `.interlock/ledger/journal.jsonl` into `packages/ledger/test/fixtures/`) replays under v4 with the
  same accepted and refused counts as under v3. `SessionView` gains `narration`, in order.
- **A session view for every session.** Backfill records `session-started` for each node it clears,
  building the brief the way the runner does from the graph, the standing table and the node, and
  when the session directory holds a `debrief@v2` it ingests it (`debrief-filed`) and its `notes@v0`
  (`note-appended`). A v0 or v1 debrief is narrated as legacy and not ingested. Backfill stays
  idempotent: a second run records nothing new for a session it already recorded; say how you key
  that.
- **`interlock session show <graph> <node> [--session <id>]`.** Prints, in this order: Brief
  (acceptance, gates), Context (graph base SHA, derivation runtime and model when a debrief is
  filed, the gates the runner ran with their receipt ids), Discoveries, Decisions (id, hunks, one
  line each; the because on request with `--because`), Outcome (from the node's view), then Notes
  and Narration with times. Latest session of the node by default; a node with no session gets a
  sentence. Legacy debriefs print what they carry and say which version they are.

## Out of scope

The face; `position@v1`; any verb that writes an outcome or gate; the substrate. Do not edit
`AGENTS.md`, either design note, any graph, `.interlock/config.yaml`, this brief, or any other
session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. A why that a name cannot carry goes in the commit body. Never quote `AGENTS.md`, this
  brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop, query or touch herdr.
  Never append to the shared journal by hand; the tests use fixtures and scratch directories.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the output of `interlock session show 0001-bootstrap verifier-hunks` verbatim,
   and the replay counts of the real journal fixture under `event@v4`.

When the debrief is committed, stop and wait. The runner judges from there.
