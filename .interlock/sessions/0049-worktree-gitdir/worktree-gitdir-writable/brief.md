---
interlock: brief@v1
graph: 0049-worktree-gitdir
node: worktree-gitdir-writable
role: implementer
gates:
  - id: writable-root-proof
    kind: command
    run: pnpm --fail-if-no-match --filter runner exec vitest run test/writableRoot.test.ts --passWithNoTests=false
    expect_output: 'writable-root-sandbox-proof: passed'
  - id: writable-root-launch-proof
    kind: command
    run: pnpm --fail-if-no-match --filter runner exec vitest run test/writableRootLaunch.test.ts --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
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

> When `writable_root_args` is present, resolve each directory once
> through `worktree.ts`, using `git rev-parse --path-format=absolute
> --git-dir` followed by `git rev-parse --path-format=absolute --git-
> common-dir` in the node worktree. If the returned absolute paths are
> equal, append no expansion. Otherwise append a full template expansion
> for the common directory, followed by a full expansion for the per-
> worktree directory. Preserve the original runtime entry and args.
> Without the field, preserve argv and perform no root resolution. Failure
> of either resolution returns the existing readable typed refusal before
> `openPane` or `startAgent`; no partial expansion is launched. Derive no
> additional roots.
>
> Update the shared schema description, Runtime catalogue arguments
> rationale, and both configuration examples to describe this behavior.
> Keep the one-placeholder constraints and configuration versions
> unchanged. Append a bend-log row explaining the departure from common-
> directory-only expansion; preserve historical artifacts. In
> schemas/parts/writable-root-args.json the operational sentence reads:
> "For a node in a linked worktree, the runner appends two full expansions
> of this repeatable template after the runtime's args: first for the
> absolute common git directory, then for the absolute per-worktree git
> directory. Each expansion replaces {path} with that directory as one
> argv element, never shell-evaluated or split. Outside a linked worktree,
> no expansion is appended."
>
> In `writableRootLaunch.test.ts`, assert exact common-then-per-worktree
> expansions, whole argv elements including paths containing spaces and
> quotes, unchanged argv for main worktrees and absent templates, both
> resolution refusals, and independent attempts sharing an immutable
> runtime entry. Test each resolution failure independently, asserting its
> readable reason and zero pane-open and agent-start calls. In
> `writableRoot.test.ts`, retain the existing sandbox assertions and add a
> faithful reproduction of the motivating metadata protection: common-
> root-only must reproduce the denial; production-supplied roots must
> permit fresh `git add` and an unsigned commit, with hooks disabled and
> reflogs enabled. Verify index updates, new objects, shared branch ref
> and branch reflog updates, and the per-worktree HEAD reflog update.
> Unrelated writes remain denied. Emit the proof marker only after these
> assertions pass.
>
> Strict TypeScript, no assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No
> push, no merge; the human merges.
