---
interlock: brief@v1
graph: 0051-no-detached-maintenance
node: fixtures-and-worktrees
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
  - id: fixture-guard-proof
    kind: command
    run: pnpm --fail-if-no-match --filter cli exec vitest run test/fixtureGuard.test.ts --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
  - id: verifier-cleanup-proof
    kind: command
    run: pnpm --fail-if-no-match --filter verifier exec vitest run test/fixtureCleanup.test.ts --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
  - id: parallel-suite-2
    kind: command
    run: pnpm test
    expect_output: 'Tests +[1-9][0-9]* passed'
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

1. Commits satisfying the acceptance, with focused checks and standing gates run before handoff. Report unresolved acceptance honestly. The runner's gate receipts are the binding proof.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> Put the shared helper at `test/support/gitFixture.ts`, depending only on Node
> built-ins, and import it through relative `.ts` paths from package tests. It
> owns fixture Git execution and argv construction, including Git argv passed
> through `sandbox-exec`. Preserve caller identity, dates, input, cwd and error
> behavior. Migrate every direct fixture Git call, including read and setup
> commands, and make existing package helpers delegate to it.
>
> Besides the listed commit/merge producers, cover
> `packages/verifier/test/git.test.ts`;
> `packages/cli/test/{judge,run,plan,repositoryOrigin}.test.ts`;
> `packages/cli/test/face/landedCache.test.ts`;
> `packages/runner/test/{worktree,gitCeiling,gateJudge}.test.ts`; and
> `packages/runner/test/support/driveFixture.ts`. Account explicitly for the Git
> forwarding script in `writableRootLaunch.test.ts`.
>
> Apply `-c maintenance.auto=false` to every direct fixture Git invocation.
> Record the installed Git version and retain a deterministic
> enabled-positive-control/suppressed-negative-control proof. Add `gc.auto=0`
> only if evidence identifies an independent automatic-GC path on a supported
> Git version. `gc.auto=0` alone does not disable every maintenance task.
>
> Before invoking production code, initialize every disposable fixture
> repository with repository-local `maintenance.auto=false`, so production Git
> calls and linked worktrees inherit fixture containment. Retain per-invocation
> suppression for direct fixture commands. Preserve the effectiveness of 0050's
> cleanup regression: its isolated repository explicitly sets
> `maintenance.auto=true` and `maintenance.autoDetach=false`. An enabled
> positive control must demonstrate that the unsafe invocation performs
> maintenance; the protected helper must suppress it. Fixture defaults must not
> make the regression pass without the helper's protection.
>
> Implement a deterministic source guard over executable test/support sources
> using the TypeScript AST, in `packages/cli/test/fixtureGuard.test.ts`. Enforce
> the audited fixture process boundary and fail closed on unsupported command
> construction. Cover named, aliased and namespace imports of `execFileSync`,
> `execFile`, `spawnSync`, `spawn`, `execSync` and `exec`; string and array
> arguments; variable, spread and template arguments; shell strings and
> generated shell scripts; and commands nested beneath `sandbox-exec` or `sh`.
> Guard every fixture Git command. Include negative controls for these forms and
> positive controls for permitted helper use. Keep instrumentation exceptions
> exact and observation-only. Missing scan roots, enumeration failures and empty
> source sets fail the guard. The helper rejects arguments or environment
> settings that override its suppression.
>
> Strict TypeScript, no type assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No push,
> no merge; the human merges.
