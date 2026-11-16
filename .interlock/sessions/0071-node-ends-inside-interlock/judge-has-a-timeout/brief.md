---
interlock: brief@v1
graph: 0071-node-ends-inside-interlock
node: judge-has-a-timeout
role: implementer
gates:
- id: deadline-tests-pass
  kind: command
  run: pnpm --fail-if-no-match --filter runner exec vitest run test/deadline.test.ts --passWithNoTests=false
  expect_output: Tests +([4-9]|[1-9][0-9]+) passed
- id: typescript-compiles
  kind: command
  run: pnpm typecheck
scope:
- .interlock/arcs.yaml
- .interlock/graphs/0071-node-ends-inside-interlock.yaml
- .interlock/sessions/0071-node-ends-inside-interlock/judge-has-a-timeout/brief.md
- packages/cli/src/judge.ts
- packages/runner/src/deadline.ts
- packages/runner/test/deadline.test.ts
substrate:
  address: none
---

## Acceptance (verbatim from the graph)

> A judge has a deadline (default 45 minutes, `--timeout <minutes>`, and a per-graph `judge_timeout_minutes`): when
> it passes, every gate process the judge started is ended (TERM, then KILL after 10 seconds, only processes the
> judge started), the judge records "gave up after N minutes on gate <id>" and exits non-zero. A judge waiting on a
> held lease says whose lease and since when every minute instead of waiting silently, and that wait counts toward
> the deadline. Touches only: packages/cli/src/judge.ts, packages/runner/src/deadline.ts (new),
> packages/runner/test/deadline.test.ts (new). Named cases: "a judge past its deadline ends its gate processes and
> says so"; "only processes the judge started are signalled"; "a held lease is named every minute"; "the per-graph
> timeout overrides the default".

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0071-node-ends-inside-interlock.yaml`): why this graph exists and what is out of scope.
3. `docs/design/0001-interlock.md` and `docs/shapes.md` where the acceptance touches an artifact version, and the files and
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
- No files outside this worktree, except the temp homes your tests create with mkdtemp under the system temp folder, as the graph's read says. No `rm -rf`. Never start or stop herdr.
- Never pipe a test runner, build or install into `head`, `tail` or anything that can exit before it
  does: an early exit breaks the pipe and leaves test workers running with no owner. Write the output
  to a file under the package's ignored `test/.runs/` folder and read that file instead.
- This brief's permissions are the answer: do not ask for a permission it already grants. It grants
  committing on this branch in this worktree and filing the debrief as the last commit; do that without
  asking. Ask only about something the brief does not settle.
- Before you file the debrief, stop every background shell or Bash call you started.
- Before you file the debrief (and before any refile), end every vitest worker and child process you started and confirm with pgrep that none survives; orphaned test workers that outlive their command are a defect in your work.

## Deliverable

1. Commits satisfying the acceptance, with focused checks and standing gates run before handoff. Report unresolved acceptance honestly. The runner's gate receipts are the binding proof.
2. `notes.yaml` beside this brief, `notes@v0`: every choice with its because, every surprise
   with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit: `head_sha` = last code
   commit, a because on every decision, decisions a manifest of the diff, `open` carrying
   anything the acceptance did not foresee.

