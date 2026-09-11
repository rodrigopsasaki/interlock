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
  - packages
  - .interlock/sessions/0001-bootstrap/face
substrate:
  address: none
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
