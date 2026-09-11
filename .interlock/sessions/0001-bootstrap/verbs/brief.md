---
interlock: brief@v1
graph: 0001-bootstrap
node: verbs
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
  - id: cancel-writes-outcome
    kind: command
    run: pnpm --filter cli --fail-if-no-match test --testNamePattern cancel
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - .interlock/sessions/0001-bootstrap/verbs
substrate:
  address: none
---

# Brief · node `verbs` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, approved by a receipt in the repository's shared journal. Do not
  edit any graph file.
- **node:** `verbs`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runner-command-gate`, cleared.
- **how this session runs:** `interlock run` leased this node, created or resumed this worktree,
  committed this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> A person's verbs over a node, each writing the outcome or gate state it is named for and refusing
> without a recorded who and why: `interlock node cancel <graph> <node> --by --because` sets the
> outcome `cancelled`; `interlock node reset <graph> <node> --by --because` sets `reset`, so the
> runner may lease the node again; `interlock gate waive <graph> <node> <gate> --by --because` moves
> the gate to `waived` over its latest receipt, and refuses when there is none. The ledger's own
> transition rules decide what is legal; an illegal move is a sentence. `pause` is not built: no
> outcome kind states a voluntary hold truthfully, and the design note records the gap where it
> already names it.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: vocabulary (outcome kinds, gate states, authority, because), invariant I10,
   Constraints.
2. `docs/design/0001-interlock.md`: Gates, D5, D21, Node lifecycle. `docs/design/0002-face.md`:
   D15, which maps the face's verbs to ledger events and names the `pause` gap.
3. `packages/ledger/src/outcome.ts`, `gate.ts`, `projection.ts` (which transitions the projection
   accepts, `proposeGateMove`), `packages/cli/src/graph/approve.ts` (a person's verb that already
   writes a gate receipt with `--by` and `--because`; mirror its shape), `packages/cli/src/main.ts`
   (the group and action dispatch), `packages/cli/src/judge.ts` (a verb that opens a short-lived
   ledger, appends, closes).
4. `packages/runner/src/lease.ts` and `packages/cli/src/run.ts`: what the runner checks before it
   leases a node, so that `reset` really lets it lease again.

## What this node builds

- **`interlock node cancel <graph> <node> --by <who> --because <why>`** appends `outcome-set` with
  kind `cancelled`, the node's current receipts, the authority and the because.
- **`interlock node reset <graph> <node> --by <who> --because <why>`** appends `outcome-set` with
  kind `reset` likewise, and the node reads as ready to the runner and to `graph show` afterwards.
- **`interlock gate waive <graph> <node> <gate> --by <who> --because <why>`** appends `gate-moved`
  to `waived` with the authority, the because and the gate's latest receipt; with no receipt for
  that gate, it refuses with a sentence saying a waiver needs something to waive.
- **Refusals are sentences**: missing `--by` or `--because`; an unknown graph, node or gate; a
  transition the ledger's rules reject (say which rule); a node with a live lease for `reset`
  (name the session and its expiry). Each verb opens the ledger, appends one event, closes, and
  prints one line naming what it wrote.
- **`pause`.** Not built. Add one bend-log row in `docs/design/0002-face.md`, in that note's own
  register, recording that the verbs above exist, that `pause` waits for an outcome kind that can
  state a voluntary hold truthfully, and where that kind would have to enter (`Outcome` in the
  ledger, with an event version). That row is the only design-note edit you make.

## Out of scope

The face; `position@v1`; `session show`; any new outcome kind; the substrate. Do not edit
`AGENTS.md`, `docs/design/0001-interlock.md`, any graph, `.interlock/config.yaml`, this brief, or
any other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. Never quote `AGENTS.md`, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop, query or touch herdr.
  Never run a verb against the shared journal; tests use scratch repositories.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the refusal sentence of each verb without `--because`, verbatim, from a scratch
   repository.

When the debrief is committed, stop and wait. The runner judges from there.
