---
interlock: brief@v1
graph: 0001-bootstrap
node: verifier-hunks
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
  - id: inverse-check
    kind: command
    run: pnpm --filter verifier --fail-if-no-match test --testNamePattern
      unexplained
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
  - .interlock/local.example.yaml
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
  - .interlock/sessions/0001-bootstrap/runner-command-gate/brief.md
  - .interlock/sessions/0001-bootstrap/runner-command-gate/debrief.yaml
  - .interlock/sessions/0001-bootstrap/runner-command-gate/notes.yaml
  - .interlock/sessions/0001-bootstrap/scaffold/brief.md
  - .interlock/sessions/0001-bootstrap/scaffold/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/brief.md
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
  - packages/cli/src/main.ts
  - packages/cli/src/run.ts
  - packages/cli/src/sweep.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/run.test.ts
  - packages/cli/test/sweep.test.ts
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
  - pnpm-lock.yaml
  - pnpm-workspace.yaml
  - tsconfig.json
  - vitest.config.base.ts
substrate:
  address: none
graph_base_sha: 043c78a0bea483de7d212031255b771d493a7ab5
session: 052f6500-4932-4fd9-bfba-0e646e60a2e3
---
# Brief · node `verifier-hunks` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, **approved** against content sha256 `d650e7738535cd36…`. Do not
  edit the graph file.
- **node:** `verifier-hunks`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `debrief-schema` and `runner-command-gate`, both cleared with receipts in the
  journal.
- **how this session runs:** this is the first node run by `interlock run` itself. The runner
  leased this node, created this worktree at the graph base, wrote this brief into it, started
  you in a herdr pane, and will run the gates and judge the outcome when you stop. Nothing about
  the rules changes because a program briefed you instead of a person.
- **session start SHA:** `git rev-parse HEAD` before you change anything; record it as
  `session_start_sha`. **graph base SHA:** the same value, since the runner created this worktree
  at the graph base.

## Acceptance (verbatim from the graph)

> Deterministic marks over a debrief against its diff at the debriefed SHA: every decision
> cites a hunk that exists; every discovery cites a location that exists with the quoted
> content; every hunk has a decision, or it is marked unexplained; every term is in one of the
> two vocabularies, or it is a gap. Marks never block. Every mark carries its derivation.

## Gates

Standing gates plus the node's own. The runner runs them when you stop; run them yourself to
iterate.

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate 0001-bootstrap verifier-hunks` (real now:
  your `debrief.yaml` must be `debrief@v2` with a because on every decision, and your `notes.yaml`
  must be valid `notes@v0`)
- `inverse-check` — `pnpm --filter verifier test --testNamePattern unexplained`

## Read first

1. `AGENTS.md`: vocabulary (`mark`, `gap`, `derivation`, `decision`, `discovery`), invariants I3
   and I4, the Constraints.
2. `docs/design/0001-interlock.md`: The verifier, Derivation, D6, D21, and the bend log.
3. `packages/ledger/src/mark.ts` (the `Mark` type and its four kinds: rooted, unrooted,
   unexplained, gap; `Gap`), `derivation.ts`, `debrief.ts`, `event.ts` (is there a mark event?
   if not, that is a shape question for `open`, not a coinage).
4. `packages/debrief/src`: the `debrief@v2` reader that yields a `Debrief`; the v0/v1 readers.
5. `packages/runner/src/gateJudge.ts` and `packages/cli/src/run.ts`: where a judged session's
   debrief is ingested, so marks can be produced at the same moment.
6. The six session directories under `.interlock/sessions/0001-bootstrap/`, whose debriefs cite
   hunks in the forms `path` and `path:start-end`, discoveries cite `found_at` as a path, a
   path with lines, a command, or a quoted out-of-band citation, and whose diffs exist in this
   repository's history (`session_start_sha..head_sha` for each). They are your fixtures.

## What the verifier is

A library in `packages/verifier` and one CLI command. Deterministic. No model is called anywhere.

- **Input.** A `Debrief` (v2), the repository, and the range `session_start_sha..head_sha`.
- **Marks, one per claim, plus the inverse.** For every decision: each hunk it cites is
  `rooted` if the path (and line range, when given) exists in the diff of the range, `unrooted`
  otherwise. For every discovery: `rooted` if `found_at` names a path that exists at `head_sha`
  (with the quoted content present when a quote is given), or is a command, or is the
  out-of-band citation form; `unrooted` otherwise. For every file changed in the range: covered
  by some decision's `hunks` or `produces`, or marked `unexplained`, the inverse check. For every
  word used as a type or module name in the range's added lines: in the harness vocabulary, the
  professed domain vocabulary, or plain programming English, or a `gap` with the nearest term.
  Plain programming English is a fixed list you define and record; err toward gap, since a gap is
  telemetry and costs nothing.
- **Marks never block.** The verifier returns marks; it never fails a gate. A standing gate may
  later consume marks; that is a team's choice, not the verifier's.
- **Every mark carries its derivation**: `{ kind: "gate", gate: "verifier-hunks", version,
  runner }` for the deterministic marks. Nothing here carries a model derivation because nothing
  here calls a model.
- **`interlock verify <graph> <node>`.** Reads the session's `debrief.yaml`; a legacy (v0/v1)
  debrief is a sentence saying marks require `debrief@v2`; a v2 debrief yields marks, printed as
  a position of the debrief: counts per kind, then each unrooted and unexplained mark with what
  was expected. Exit zero regardless of marks (they never block); non-zero only for a missing or
  malformed debrief.
- **Ingestion.** When the runner judges a v2 session, marks are recorded beside the debrief.
  Whether the ledger has an event kind for a mark decides the shape question: if `event@v2` has
  none, adding one is a new union arm, a shape change you are not licensed to make; record the
  exact proposal under `open` and print marks without persisting them. If a fitting event exists,
  use it.
- **Errors are sentences**: missing debrief, legacy version, range not in history, malformed
  hunk citation.

## Out of scope

Model-produced marks; consuming marks in a gate; the face's views; the substrate. Do not edit
`AGENTS.md`, either design note, the graph, `.interlock/config.yaml`, or this brief. Do not edit
any prior session's files.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types, tests and module
  boundaries carry the meaning. Never quote AGENTS.md, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`.
- Node pinned by `.node-version`; run everything through `mise exec --`. Verify any new
  dependency on npm and justify it.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop or reconfigure herdr.

## Deliverable

1. Commits satisfying the acceptance, gates green.
2. `notes.yaml` beside this brief (`notes@v0`), appended while you work, committed with the code.
3. `debrief.yaml` beside this brief in **`debrief@v2`** (see `packages/debrief` for the shape and
   the six existing files for examples; `debrief-schema`'s own debrief is v2), as the final
   commit, `head_sha` = last code commit, a because on every decision, decisions a manifest of
   every changed file.
4. In the debrief: the output of `interlock verify 0001-bootstrap debrief-schema` (the one v2
   debrief in the corpus besides yours) and of `interlock verify 0001-bootstrap verifier-hunks`
   on your own debrief, verbatim.

When the debrief is committed, stop and wait. The runner judges from there.
