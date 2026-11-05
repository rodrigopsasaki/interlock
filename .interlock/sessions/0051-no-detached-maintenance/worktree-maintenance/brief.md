---
interlock: brief@v1
graph: 0051-no-detached-maintenance
node: worktree-maintenance
role: implementer
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: lint
    kind: command
    run: pnpm lint
  - id: comments
    kind: command
    run: pnpm check:comments
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: worktree-maintenance-proof
    kind: command
    run: pnpm --fail-if-no-match --filter runner exec vitest run test/worktreeMaintenance.test.ts --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
scope: []
substrate: { address: none }
---

# Brief · node `worktree-maintenance` · graph `0051-no-detached-maintenance`

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

1. Commits satisfying the acceptance, with focused checks and standing gates run before handoff. Report unresolved acceptance honestly. The runner's gate receipts are the binding proof.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> Spend at most 45 minutes investigating the installed Git version, recorded
> effective maintenance configuration and actual runner lifecycles. Identify the
> enabled tasks and their possible write destinations; the geometric-repack
> trigger alone does not establish every task's boundary. Run controlled probes
> in a fresh disposable repository beneath this checkout. Never attach a probe
> worktree to this checkout's common Git directory or modify global
> configuration. Retain traces outside the directory deliberately removed. Bound
> each probe and await or terminate only its identified descendants before final
> scratch cleanup.
>
> Retain the Git version, relevant configuration, resolved worktree/common/admin
> paths, positive controls, subprocess evidence and observed writes. Classify
> the result as demonstrated exposure, demonstrated non-overlap for the stated
> configuration and lifecycle, or inconclusive. Successful removals, absent
> maintenance locks and finite trials without observed writes do not establish
> non-overlap. For demonstrated exposure, fix the narrowest runner-owned cause
> and prove that it prevents the evidenced writer from reaching a directory
> being removed. Containment must take effect before maintenance starts; flags
> on `removeWorktree` cannot cancel an earlier daemon. For demonstrated
> non-overlap, change no production code and state the supported boundary.
> Record agent, setup and gate commands separately. If exposure requires
> containment outside this approved scope, or the investigation remains
> inconclusive, retain the evidence in `open` and leave the production
> acceptance unresolved.
>
> Always provide `packages/runner/test/worktreeMaintenance.test.ts`. Exercise
> the actual linked-worktree/common/admin boundary and the demonstrated
> maintenance conditions deterministically, with positive controls. When
> production changes are required, include a regression that fails before the
> change. A passing proof requires a conclusive supported boundary; an
> inconclusive investigation must not be converted into a passing or skipped
> test. Use no race-dependent sleeps, cleanup retries or maintenance-lock
> absence assertions.
>
> Strict TypeScript, no type assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No push,
> no merge; the human merges.
