---
interlock: brief@v1
graph: 0050-verifier-fixture-writer
node: writer-is-closed
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
  - id: cleanup-proof
    kind: command
    run: pnpm --fail-if-no-match --filter verifier exec vitest run test/fixtureCleanup.test.ts --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
  - id: verifier-suite
    kind: command
    run: pnpm --fail-if-no-match --filter verifier exec vitest run --passWithNoTests=false
    expect_output: 'Tests +[1-9][0-9]* passed'
  - id: parallel-suite-2
    kind: command
    run: pnpm test
    expect_output: 'Tests +[1-9][0-9]* passed'
  - id: parallel-suite-3
    kind: command
    run: pnpm test
    expect_output: 'Tests +[1-9][0-9]* passed'
scope: []
substrate: { address: none }
---

# Brief · node `writer-is-closed` · graph `0050-verifier-fixture-writer`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0050-verifier-fixture-writer.yaml`): why this graph exists and what is out of scope.
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

1. For a demonstrated repair, commits satisfying acceptance and passing runner-produced gate receipts; agent runs are preliminary validation. Otherwise, deliver the bounded unresolved handoff specified above.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> Spend at most 60 minutes on instrumented investigation, including at most
> three full parallel suite runs. Start with detached work launched by fixture
> Git commands. Retain evidence linking a writer to the exact fixture directory
> and invocation. A controlled reproducer may establish the conditions that
> trigger the mechanism; record those conditions and distinguish it from
> reproduction of the historical ENOTEMPTY. Fix only a demonstrated mechanism at
> its owning boundary. Change production Git invocations only if evidence
> implicates that boundary. Keep cleanup as one immediate rmSync(directory, {
> recursive: true, force: true }); add no cleanup retry, delay, timeout increase
> or suite serialization.
>
> Tests: a regression in packages/verifier/test/fixtureCleanup.test.ts exercises
> the demonstrated triggering condition and fails on the pre-fix code. Repeated
> green suites or assertions that Git flags are present alone are insufficient.
> On the final code, the runner's standing test gate and two additional full
> parallel suite gates must all pass in the same judgment. Retain their output
> as receipts.
>
> If the investigation budget expires without a demonstrated mechanism, record
> "not reproduced; cause unconfirmed", the attempts, retained evidence and
> remaining hypotheses. Make no source or regression-test changes; preserve
> notes and debrief. This is an unresolved handoff: do not claim acceptance
> satisfied, fabricate a cleanup test, or waive cleanup-proof. The node remains
> held for a person to choose its disposition.
>
> Strict TypeScript, no type assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No push,
> no merge; the human merges.
