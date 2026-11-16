---
interlock: brief@v1
graph: 0071-node-ends-inside-interlock
node: interlock-runs-the-landing
role: implementer
gates:
- id: land-tests-pass
  kind: command
  run: pnpm --fail-if-no-match --filter cli exec vitest run test/land.test.ts --passWithNoTests=false
  expect_output: Tests +[1-9][0-9]* passed
- id: fixture-env-tests-pass
  kind: command
  run: pnpm --fail-if-no-match --filter runner exec vitest run test/fixtureEnv.test.ts --passWithNoTests=false
  expect_output: Tests +[1-9][0-9]* passed
- id: typescript-compiles
  kind: command
  run: pnpm typecheck
scope:
- .interlock/arcs.yaml
- .interlock/graphs/0071-node-ends-inside-interlock.yaml
- .interlock/sessions/0071-node-ends-inside-interlock/interlock-runs-the-landing/brief.md
- packages/cli/src/land.ts
- packages/cli/src/main.ts
- packages/cli/test/land.test.ts
- packages/runner/src/fixtureEnv.ts
- packages/runner/test/fixtureEnv.test.ts
- packages/schemas/src/graph.ts
substrate:
  address: none
---

## Acceptance (verbatim from the graph)

> `interlock land <graph> <node>` takes a cleared node to a land branch: a land worktree from the node's head, main
> brought in the same way as the judge does, the frozen install, then the graph's landing suites (each node's gates
> plus the repository's test, lint and typecheck) run one at a time under a fixture environment (HOME, XDG folders
> and tool state under the system temp folder, a fixture git identity, GIT_CONFIG_GLOBAL=/dev/null,
> GIT_CONFIG_NOSYSTEM=1, and VITEST_MAX_WORKERS / NODE_OPTIONS from `--test-workers` and `--heap-mb`, which Preston
> passes from its mode). It prints each suite's result, the land branch name, its full sha and whether every commit
> on it is signed (%G? G); an unsigned or unknown-key commit refuses the land. It pushes nothing; pushing stays
> with the caller. Test files named in the graph's `known_environment_failures` list are reported separately and do
> not fail the land, and every name on that list is printed. Touches only: packages/cli/src/land.ts (new),
> packages/runner/src/fixtureEnv.ts (new), packages/cli/src/main.ts, packages/cli/test/land.test.ts (new),
> packages/runner/test/fixtureEnv.test.ts (new), packages/schemas/src/graph.ts and its test for the new optional
> keys. Named cases: "land builds a worktree from the node head with main in"; "suites run one at a time under the
> fixture environment"; "the fixture carries a git identity and no global git config"; "test limits come from the
> flags"; "an unsigned commit refuses the land"; "known environment failures are named and do not fail the land";
> "land prints the branch, its full sha and the signature status"; "land pushes nothing".

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

