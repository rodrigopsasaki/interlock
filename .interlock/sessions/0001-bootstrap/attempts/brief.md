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
  - packages
  - .interlock/sessions/0001-bootstrap/attempts
substrate:
  address: none
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
