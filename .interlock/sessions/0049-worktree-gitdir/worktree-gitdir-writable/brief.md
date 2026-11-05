---
interlock: brief@v1
graph: 0049-worktree-gitdir
node: worktree-gitdir-writable
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `worktree-gitdir-writable` · graph `0049-worktree-gitdir`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0049-worktree-gitdir.yaml`): why this graph exists and what is out of scope.
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

> For a node in a linked worktree, when the runtime's profile declares
> `writable_root_args`, the runner hands two writable roots for that
> attempt, in this order: the absolute common git dir (as 0047 does) and
> the absolute per-worktree git dir from `git rev-parse --git-dir` in that
> worktree. Each root is one expansion of the profile's template, the
> `{path}` element replaced by the root as one argv element, appended
> after the profile's args. When the two resolve to the same path (a
> main worktree), it is handed once. A worktree that is not linked gets
> no writable root, as today. Resolution failure refuses the attempt
> before the agent starts, with the reason in words, as 0047 does.
> Nothing else is widened.
>
> Tests: extend packages/runner/test/writableRoot.test.ts so a real
> linked worktree built by the test yields exactly the two expanded
> roots in order, a main worktree yields none, and a failed
> `--git-dir` resolution refuses before launch; extend
> packages/runner/test/writableRootLaunch.test.ts so the launched argv
> against a real linked worktree carries both roots, each as single argv
> elements, and the per-worktree root is the directory that holds that
> worktree's index. Strict TypeScript, no assertions, no non-null
> operators. Preserve every historical artifact. Append typed notes for
> choices and discoveries. No push, no merge; the human merges.
