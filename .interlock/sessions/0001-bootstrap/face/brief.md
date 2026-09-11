---
interlock: brief@v1
graph: 0001-bootstrap
node: face
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
  - id: no-write-surface
    kind: command
    run: pnpm --filter face --fail-if-no-match test --testNamePattern write-surface
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - .gitignore
  - .interlock/config.yaml
  - .interlock/graphs/0001-bootstrap.yaml
  - .interlock/graphs/0002-shapes.yaml
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
  - .interlock/sessions/0001-bootstrap/verbs/brief.md
  - .interlock/sessions/0001-bootstrap/verbs/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verbs/notes.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/brief.md
  - .interlock/sessions/0001-bootstrap/verifier-hunks/debrief.yaml
  - .interlock/sessions/0001-bootstrap/verifier-hunks/notes.yaml
  - .interlock/sessions/0002-shapes/brief-shape/brief.md
  - .interlock/sessions/0002-shapes/brief-shape/debrief.yaml
  - .interlock/sessions/0002-shapes/brief-shape/notes.yaml
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
  - packages/cli/src/flags.ts
  - packages/cli/src/gate/waive.ts
  - packages/cli/src/graph/approve.ts
  - packages/cli/src/graph/show.ts
  - packages/cli/src/judge.ts
  - packages/cli/src/main.ts
  - packages/cli/src/node/cancel.ts
  - packages/cli/src/node/reset.ts
  - packages/cli/src/run.ts
  - packages/cli/src/session/show.ts
  - packages/cli/src/sweep.ts
  - packages/cli/src/verify.ts
  - packages/cli/test/backfill.test.ts
  - packages/cli/test/brief/validate.test.ts
  - packages/cli/test/debrief/validate.test.ts
  - packages/cli/test/gate/waive.test.ts
  - packages/cli/test/graph/approve.test.ts
  - packages/cli/test/graph/gitFixture.ts
  - packages/cli/test/graph/show.test.ts
  - packages/cli/test/judge.test.ts
  - packages/cli/test/main.test.ts
  - packages/cli/test/node/cancel.test.ts
  - packages/cli/test/node/reset.test.ts
  - packages/cli/test/run.test.ts
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
  - packages/face/src/float.ts
  - packages/face/src/index.ts
  - packages/face/src/position.ts
  - packages/face/src/positionGate.ts
  - packages/face/src/receiptSummary.ts
  - packages/face/src/render.ts
  - packages/face/src/root.ts
  - packages/face/src/topology.ts
  - packages/face/src/validate.ts
  - packages/face/src/weight.ts
  - packages/face/test/approval.test.ts
  - packages/face/test/criticalPath.test.ts
  - packages/face/test/document.test.ts
  - packages/face/test/float.test.ts
  - packages/face/test/position.test.ts
  - packages/face/test/render.test.ts
  - packages/face/test/root.test.ts
  - packages/face/test/topology.test.ts
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
  - scripts/check-readme.ts
  - tsconfig.json
  - vitest.config.base.ts
  - vitest.setup.ts
substrate:
  address: none
graph_base_sha: 3cf6baf6b1897881ca48d3d988be8dc1cc86f22d
session: 41680329-73ba-4ae1-9293-b40edaa09610
---

# Brief · node `face` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, approved by a receipt in the repository's shared journal. Do not
  edit any graph file.
- **node:** `face`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runner-command-gate`, `face-read`, `attempts`, `position-model`, all cleared.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop. You are
  building the thing a person will open in a pane beside yours.

## Acceptance (verbatim from the graph)

> A process that runs in a herdr pane and reads the journal, the graph files and herdr fresh on
> every render. Levels, one key down and one key up: every graph with its approval and cleared
> count; a graph's position, `position@v1`, with critical path and float; a node with its gates,
> receipts and attempts; a session's five columns, notes and narration; and, on a live session, its
> herdr pane, focused. Verbs on keys dispatch as subprocesses into the same binary: approve, run,
> judge, cancel, reset, waive, sweep, backfill. It owns no state; killing the pane loses scrollback
> and nothing else.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: axioms 2 and 3, invariants I2, I3, I6, I10, the vocabulary, Constraints.
2. `docs/design/0002-face.md` in full. D14 (reads fresh, owns nothing), D15 (verbs as
   subprocesses, never a write from the face's process), D16 (herdr through the one adapter, read,
   with focus the one UI write), D17 (text is the surface), D18 (the face never authors a graph or
   brief) are this node's specification. The Views and Seams tables say what exists.
3. `docs/design/0001-interlock.md`: Position, not events; The session drilldown; D2; D26.
4. `packages/face/src`: `positionOf` and the `Position` types, `renderPosition`, `document.ts`,
   `root.ts`, `attempts.ts`, `float.ts`. `packages/cli/src/graph/show.ts` (how the CLI joins
   herdr's agent status into the position through the adapter), `packages/cli/src/session/show.ts`
   (the five columns as text; extract its pure rendering into functions you can call from a frame),
   `packages/cli/src/main.ts` (every verb the binary has), `packages/runner/src/herdr/adapter.ts`
   (the one file that touches herdr; `reportedAgentStatus` and the calls it makes),
   `packages/ledger` (`readReplay`, never `createLedger`).
5. The debrief of `position-model` under `.interlock/sessions/0001-bootstrap/position-model/`:
   its first open item says the pane-list shape the status join reads was never seen live.

## What this node builds

- **`interlock face [graph]`.** A full-screen terminal program for the pane it runs in: alternate
  screen, hidden cursor, a frame redrawn on every keypress, on a timer of about two seconds, and
  when the journal file changes, and always from a fresh read of the graph files, `readReplay` over
  the journal, and herdr's agent status. The only state it keeps is where the cursor is and which
  level it is on. Resize redraws. Quitting or killing the pane restores the terminal and loses
  nothing.
- **Levels.** Plans: every graph under `.interlock/graphs`, its approval state, cleared over total
  nodes, how many of its sessions have a live agent. Graph: the position as `renderPosition` prints
  it, the critical path, the float where measured, one line per node with a cursor, and a status
  symbol beside a node whose latest session has a live agent. Node: its gates with receipt
  summaries, its attempts newest first with outcome, lease and agent status. Session: the five
  columns, notes and narration, as `session show` prints them. Live pane: on an attempt whose agent
  status is live, Enter asks herdr to focus that pane through the adapter; that is the one write to
  herdr this node adds, and it changes nothing herdr records.
- **Keys.** Arrows or `j` `k` move, Enter goes down, Escape or Backspace goes up, `r` redraws now,
  `q` quits, `?` shows the keys. Verbs, on the level they belong to: `a` approve the graph, `R` run
  the node, `J` judge the node, `c` cancel, `x` reset, `w` waive the gate under the cursor, `s`
  sweep, `b` backfill. A verb that needs a who and a why prompts for the because on the bottom line,
  takes the who from the `INTERLOCK_BY` environment variable or a prompt, and then dispatches
  `interlock <verb> …` as a subprocess of the same binary; the exit code and the last line of its
  output show on the bottom line until the next key. Escape cancels a prompt. The face's own
  process never appends to the journal; the `no-write-surface` test in `packages/face` asserts its
  dependency graph reaches neither `createLedger` nor `attachLedgerSink`.
- **Where the code lives.** Pure pieces in `packages/face`: a frame model for each level, a reducer
  from `(state, key, position | views)` to the next state, and renderers from a frame to lines,
  all tested by content. The process, the raw-mode keys, the timer, the file watch, the subprocess
  dispatch and the herdr calls in `packages/cli` under `face/`, composed from `packages/face`,
  `packages/runner`'s adapter and `packages/ledger`'s replay. `packages/face` never imports the
  adapter; the `one-adapter` test still holds.
- **Rendering.** Hand-rolled ANSI over the terminal's own sixteen colours, so the pane's theme is
  respected; no terminal-UI library unless you record in the debrief what it buys that a hundred
  lines of ANSI does not. Verify any new dependency on npm and justify it; the lean is none.
- **Live status.** The status join reads `tokens` on `pane.list` entries. A pane carrying interlock's
  metadata has not been seen in a `pane.list` answer yet; herdr's `agent.list` entries are known to
  carry `tokens` and `agent_status`. Read the adapter and decide which call the face should trust,
  through the same adapter; record the choice, and make the face say "status unknown" rather than
  guess when neither answers.
- **Tests.** Frames for every level over the real bootstrap graph and a journal fixture, asserted
  by content; the reducer over a scripted key sequence; verb dispatch with a fake binary that
  records its argv and exits with a chosen code; the herdr focus call and the status read through the
  adapter's fake server; the `no-write-surface` test named so the gate above finds it. You cannot open
  the face in a pane yourself: you are in one, and you may not touch herdr. The person opens it after
  you stop.

## Out of scope

A browser renderer (D17 names when); strategies; the substrate; editing a graph, a brief or a
strategy from the face (D18); writing any herdr state other than focusing a pane; a `pause` verb.
Do not edit `AGENTS.md`, either design note, any graph, `.interlock/config.yaml`, this brief, or any
other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. A why that a name cannot carry goes in the commit body. Never quote `AGENTS.md`, this
  brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Discriminated unions for states with names.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop, query or touch herdr;
  the adapter's fake server is the only herdr a test may see. Never append to the shared journal.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the frame of each level rendered over the real bootstrap graph, verbatim, and the
   key table as `?` shows it.

When the debrief is committed, stop and wait. The runner judges from there.
