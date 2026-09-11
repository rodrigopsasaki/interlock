---
interlock: brief@v1
graph: 0001-bootstrap
node: position-model
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
  - id: position-shape
    kind: command
    run: pnpm --filter face --fail-if-no-match test --testNamePattern position
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - .interlock/sessions/0001-bootstrap/position-model
substrate:
  address: none
---

# Brief · node `position-model` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, approved by a receipt in the repository's shared journal. Do not
  edit any graph file.
- **node:** `position-model`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `face-read` (the `graph show` you replace the insides of) and `attempts` (the
  narration events and session views you read).
- **how this session runs:** `interlock run` leased this node, created or resumed this worktree,
  committed this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> `position@v1`: one typed, pure view over a graph file and the journal, per node its state, its
> gates with receipt summaries, its attempts with outcome and lease, its dependencies; the critical
> path weighted by the measured durations of each node's receipts, and each node's float, a number
> only where every duration on the path is measured and `unknown` otherwise. `interlock graph show`
> renders from it and from nothing else, and `--json` emits it. A later renderer reads the same
> function. herdr's agent status for a live session joins the view only where the one herdr adapter
> already is, never in a second file.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: vocabulary (position, receipt, spend, derivation, disposition), Compatibility.
2. `docs/design/0002-face.md` in full: D14, D16, D17 and the Views table are this node's
   specification. `docs/design/0001-interlock.md`: Position, not events; D5; Gates.
3. `packages/face/src/position.ts`, `criticalPath.ts`, `render.ts`, `document.ts`, and the `graph
   show` command in `packages/cli/src/graph/show.ts`. `packages/ledger/src/projection.ts`,
   `receipt.ts` (duration is `measured` or `unknown`), `outcome.ts`, `gate.ts`.
4. `packages/runner/src/herdr/adapter.ts`: the one file that touches herdr, and the
   `runner-command-gate` node's `one-adapter` test that keeps it so.

## What this node builds

- **`position@v1`**, a plain object with `interlock: "position@v1"` on it: the graph id and its
  approval state; nodes in dependency order, each with id, `dependsOn`, state (the states `graph
  show` prints today), gates as `{ id, state, receipt? }` where the receipt summary is id, commit,
  duration, spend and derivation kind, and attempts as `{ session, outcome?, lease?, agentStatus? }`;
  the critical path as node ids; per node a float that is `{ kind: "measured", ms }` or `{ kind:
  "unknown", because }`. A node's weight is the sum of the measured durations of the receipts in
  its outcome; a node without them weighs `unknown`, and every float on a path through it is
  `unknown` with a because that names the node. Never a number nobody measured.
- **One function.** `positionOf(graphDocument, projection, agentStatusFor?)` in `packages/face`,
  pure, tested against the real graph file and a journal fixture. `graph show` renders from its
  result and nothing else; the rendered text for the real bootstrap graph stays identical to
  today's for every line it prints today, plus float where it is measured.
- **`--json`.** `interlock graph show <id> --json` prints the object, stable key order.
- **herdr status.** The optional `agentStatusFor(session)` is supplied by the CLI, which resolves a
  session's pane through the existing adapter's reads (`pane.report_metadata` tokens name the
  graph, node and session). `packages/face` never imports the adapter; the `one-adapter` test must
  still pass. With no reachable herdr, status is absent, never guessed.

## Out of scope

The face itself; verbs; `session show` (built by `attempts`); the substrate. Do not edit
`AGENTS.md`, either design note, any graph, `.interlock/config.yaml`, this brief, or any other
session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. Never quote `AGENTS.md`, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop, query or touch herdr
  from a test; the adapter's fake server is the only herdr a test may see.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: `interlock graph show 0001-bootstrap` and `--json` output for the real graph,
   verbatim, and the float of every node with its because where unknown.

When the debrief is committed, stop and wait. The runner judges from there.
