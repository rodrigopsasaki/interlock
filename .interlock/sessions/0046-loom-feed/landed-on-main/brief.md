---
interlock: brief@v1
graph: 0046-loom-feed
node: landed-on-main
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `landed-on-main` · graph `0046-loom-feed`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0046-loom-feed.yaml`): why this graph exists and what is out of scope.
3. The contract this graph feeds: `cockpit/loom/schema.ts` (loom@v0) in the preston repository
   (`~/dev/private/preston`, read-only). Every field you add to the position must map onto it.
4. The acceptance below, verbatim from the graph, and the files and tests it names.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
- Additive only: every existing artifact, journal and schema version still reads and validates.
- Nodes in this graph run as a chain because each touches the position; build on the previous node's commits.
- Node via `mise exec --`. Run the focused test files while you work; run the standing gates
  once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End
  every commit message with a `Co-Authored-By:` line naming the model you are.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start or stop herdr.

## Deliverable

1. Commits satisfying the acceptance; all gates green, run by you before handoff.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee, including any loom@v0 field this node could not fill.

## Acceptance (verbatim from the graph)

> Say in the position whether a cleared node's work is on the repository's main line,
> so done can mean done. Each node gains `landed`, one of: `on-main` (the attempt's
> cleared head, or a patch-equivalent of it by `git cherry`, is reachable from main),
> `not-on-main`, `reverted-on-main` (it reached main and a later commit on main reverts
> it, by git's own revert trailer or a revert of its patch), or `unknown` with a
> because (no main branch found, the branch is gone, git refused). Main is the local
> branch the repository's origin HEAD names, falling back to `main` then `master`, and
> `unknown` when none exists. Read-only git only, through one adapter module; nothing
> fetches or writes. Nodes not cleared carry no `landed`. A graph is `done` in the
> position when every node is cleared and on-main. Update schemas/position@v1.json.
> Tests build real temporary git repositories and pin all four values, including a
> squash-merged branch reading on-main and a revert reading reverted-on-main. Strict
> TypeScript. No push, no merge; the human merges.
