---
interlock: brief@v1
graph: 0044-runtime-coverage
node: face-runtime-coverage
role: worker
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
  - id: face-proof
    kind: command
    run: pnpm --filter face exec vitest run test/render.test.ts test/runtimeAttempts.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages/face/test
substrate:
  address: none
---

# Brief · node `face-runtime-coverage` · graph `0044-runtime-coverage`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The acceptance below, verbatim from the graph. It is tests only; a test that exposes a
   defect is a discovery, and the fix is the smallest change that makes the test honest.
3. The files the acceptance names, and the existing tests beside them; extend their style.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
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
   anything the acceptance did not foresee. Quote your own `runtime:` line from
   `interlock graph show 0044-runtime-coverage` in a discovery: your session is half of the
   proof that the runner delivers an opening prompt to your runtime with nobody at the
   keyboard.

## Acceptance (verbatim from the graph)

> Give the face's runtime read tests of its own. Two changes, tests only unless a test
> exposes a defect.
> 
> One. `packages/face/src/render.ts` renders a node's runtime line from its live or
> latest attempt (`renderNodeRuntime`, used by `renderPosition`), and no test in
> `packages/face/test/render.test.ts` builds a position with an attempt, so that branch
> never runs. Add tests that fold a `session-started` event with a known runtime and one
> with `unknown`, and pin the rendered line for each, including that an `unknown` runtime
> degrades to the word unknown and a runtime without a model says model undeclared.
> 
> Two. `packages/face/src/runtimeAttempts.ts` selects attempts per runtime for the
> runtime list and skips sessions whose runtime is `unknown`; it has no test under
> `packages/face/test`. Add `packages/face/test/runtimeAttempts.test.ts` pinning: unknown
> sessions are skipped; the latest attempt per runtime wins; a runtime with no attempt is
> absent.
> 
> Strict TypeScript, no assertions. Preserve every historical artifact. Append typed
> notes. Run the focused tests and lint before handoff. No push, no merge; the human
> merges.
