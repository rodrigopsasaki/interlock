---
interlock: brief@v1
graph: 0051-no-detached-maintenance
node: fixtures-and-worktrees
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `fixtures-and-worktrees` · graph `0051-no-detached-maintenance`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0051-no-detached-maintenance.yaml`): why this graph exists and what is out of scope.
3. `docs/design/0001-interlock.md` where the acceptance touches an artifact version, and the files and
   tests the acceptance names.
4. The acceptance below, verbatim from the graph.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
- Every existing artifact, journal line and schema version still reads and validates; a version is
  published only where the acceptance says so.
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
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> Tests. One shared fixture helper, in a package every test suite can
> import, runs every git command a test fixture issues with
> `-c maintenance.auto=false` (and `-c gc.auto=0` only if evidence shows gc
> also detaches); every git fixture in every interlock package uses it,
> including inline calls; the verifier's 0050 helper becomes a use of it. A
> test fails when any file under packages/*/test spawns git `commit`,
> `merge` or `am` other than through that helper, so a new fixture cannot
> reintroduce the daemon.
>
> Production, evidence first. In a bounded investigation (at most 45
> minutes), establish whether a detached maintenance job started by a
> commit or merge in a node worktree can write into that worktree's
> directory or its per-worktree git dir while removeWorktree runs: build a
> linked worktree, commit in it under conditions that trigger auto
> maintenance (the objects/17 sampling 0050 found), remove it at once, and
> record what the daemon wrote and where. Record the evidence and the
> conclusion in the debrief. If it can, the runner's own git invocations
> that commit, merge or remove in node worktrees run with
> `-c maintenance.auto=false`, and a regression in
> packages/runner/test/worktreeMaintenance.test.ts fails before the change.
> If it cannot, change no production code and say why. Agents' own commits
> inside a worktree are outside Interlock's control; record whether they can
> trigger the same race and what would contain it, without changing it.
>
> Strict TypeScript, no type assertions, no non-null operators. Preserve
> every historical artifact. Append typed notes for choices and
> discoveries. No push, no merge; the human merges.
