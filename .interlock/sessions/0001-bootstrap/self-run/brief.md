---
interlock: brief@v1
graph: 0001-bootstrap
node: self-run
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
  - id: dogfood
    kind: command
    run: pnpm interlock graph status 0001-bootstrap --expect cleared
scope:
  - packages
  - docs/design/0001-interlock.md
  - .interlock/sessions/0001-bootstrap/self-run
substrate:
  address: none
---

# Brief · node `self-run` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, approved by a receipt in the repository's shared journal. Do not edit
  any graph file.
- **node:** `self-run`, the last node of the graph that built the harness. **role:** worker.
- **depends on:** `face` and `verifier-hunks`, cleared; through them, every other node.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop. You are
  the last session of the graph you are reading about.

## Acceptance (verbatim from the graph)

> This graph, loaded from this file, run through interlock. Every node above leased by the
> runner, its command gates run by the runner, its debrief verified, its outcome cleared. The
> receipts are in the journal with derivations. The first bend log entries this run produces are
> written into the design note.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: axiom 5, the vocabulary, Compatibility, Constraints.
2. `docs/design/0001-interlock.md`: Position, not events; the bend log in full (every row dated
   2026-09-09 to 2026-09-11 is a bend this graph's own run produced; read them as the history of
   what you are closing).
3. `packages/face/src/position.ts` (`positionOf`, `Position`, `NodeState`), `packages/cli/src/graph/
   show.ts`, `packages/cli/src/main.ts`, `packages/cli/src/judge.ts` (how a verb opens the ledger
   read-only through `readReplay` and prints one line), `packages/ledger/src/projection.ts`
   (sessions, leases, outcomes).
4. `interlock session show 0001-bootstrap <node>` for every node of this graph: the record of how
   each was cleared, which sessions ran it, and what its debrief said.

## What this node builds

- **`interlock graph status <graph> --expect <outcome>`.** Reads the position through
  `positionOf` and nothing else; exits zero when every node of the graph either carries the
  expected outcome or is leased by a live session at the time of the check (the node under
  judgement is leased while its own gates run, and that is the only way a graph can be checked
  from inside itself); otherwise exits non-zero and prints one line per node that does not, with
  its state. `--expect` accepts an outcome kind; `cleared` is the one this graph's gate uses. Tests
  in `packages/cli` over a fixture journal: all cleared passes; one held fails naming it; a node
  leased live passes; a node with no outcome fails.
- **The account of the run.** Read every node's session record and write, in the debrief's
  decisions and discoveries, what this graph's own run established: how many nodes were leased by
  the runner, how many judged by hand and why, how many attempts each took, which receipts stand
  at main. Where the acceptance says "every node above leased by the runner", say plainly which
  nodes were cleared through `backfill` or `judge` instead and what the journal records for them.
  The acceptance is judged on the journal, not on the story; you are making the story checkable.
- **The bend-log row.** One row in `docs/design/0001-interlock.md`, dated with your session, for
  the self-run itself: what bent when the graph that builds the harness was run by the harness,
  against which decisions, whether the way back is kept, and what was learned. The earlier rows
  already record each node's bends; do not repeat them. Do not quote this brief or any conversation.

## Out of scope

Any change to the runner, the ledger, the face's rendering, or any other package beyond the
`graph status` command and its tests; any graph; `AGENTS.md`; the other design notes;
`.interlock/config.yaml`; this brief; any other session's files.

## Constraints

- **Comments: none in `packages/*/src`.** Names, types, tests and module boundaries carry the
  meaning. Never quote `AGENTS.md`, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. No new dependencies.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch as you go. **Do not push.**
  Every message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, no `git reset --hard`, no `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal;
  `graph status` reads it through replay like `graph show` does.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter. The
   `dogfood` gate passes only if every other node of this graph reads cleared at judgement.
2. `notes.yaml` beside this brief (`notes@v0`), appended at every choice and surprise, committed.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, `head_sha` the last code
   commit, a because on every decision, decisions a manifest of every changed file.
4. In the debrief: the output of `interlock graph status 0001-bootstrap --expect cleared` run from
   your worktree, verbatim, and the table of nodes with how each was cleared.

When the debrief is committed, stop and wait. The runner judges from there.
