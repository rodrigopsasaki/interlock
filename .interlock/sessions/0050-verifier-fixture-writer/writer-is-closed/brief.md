---
interlock: brief@v1
graph: 0050-verifier-fixture-writer
node: writer-is-closed
role: implementer
gates: []
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

1. Commits satisfying the acceptance; all gates green, run by you before handoff.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> Find the process or call that writes into a verifier test's temporary repository
> after the test body returns, with evidence: reproduce the ENOTEMPTY under load
> (the full parallel `pnpm test`, or the verifier suite run repeatedly beside other
> packages) and capture what was written and by whom (the leftover path names, and
> the process, for example with lsof or a write trace, or git's own trace). Record
> the evidence and the conclusion in the debrief. Then fix the cause where it lives:
> await or close an asynchronous writer, keep two tests from sharing a path, or, if
> it is a detached git background job, have every git invocation in the verifier's
> fixtures and the code under test run with background work disabled
> (`-c gc.auto=0 -c maintenance.auto=false`) and say why. Never retry, delay or
> force rmSync, and never serialise the suite to hide it.
>
> Tests: a regression in packages/verifier/test/fixtureCleanup.test.ts that fails
> before the fix and passes after, built on the cause found (for example, asserting
> no background git job is spawned by a fixture commit, or that a test's directory
> has no writer left when afterEach runs); the existing verifier suite stays green;
> the full parallel `pnpm test` passes three times in a row, recorded in the
> debrief. If the cause cannot be reproduced in a bounded effort, the debrief says
> "not reproduced", lists what was tried, and no code changes. Strict TypeScript,
> no assertions, no non-null operators. Preserve every historical artifact. Append
> typed notes for choices and discoveries. No push, no merge; the human merges.
