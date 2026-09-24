---
interlock: brief@v1
graph: 0044-runtime-coverage
node: fixtures-and-corpus
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
  - id: corpus-proof
    kind: command
    run: pnpm --filter schemas exec vitest run test/corpus.journal.test.ts test/corpus.position.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: replay-proof
    kind: command
    run: pnpm --filter ledger exec vitest run test/replay.test.ts test/runtime.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages/ledger/test
  - packages/schemas/test
substrate:
  address: none
---

# Brief · node `fixtures-and-corpus` · graph `0044-runtime-coverage`

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

> Make the ledger fixtures and the corpus checks say what they cover. Three changes,
> tests only unless a test exposes a defect.
> 
> One. `packages/ledger/test/fixtures/journal-v3-v4-2026-09-11.jsonl` contains no
> `event@v4` line although its name promises one. Either add genuine event@v4 lines
> copied verbatim from this repository's shared journal (read-only; the journal is at the
> git common dir's `.interlock/ledger/journal.jsonl`; take a `session-started` line and
> the lines its session produced, never edit them) so the v4 upcast path is exercised by
> a real fixture, or rename the fixture to the shapes it holds and update every test that
> names it. Choose, and say why in the debrief.
> 
> Two. `packages/schemas/test/corpus.journal.test.ts` lists the journals it validates
> line by line; add `journal-v5-run-with-runtime-2026-09-24.jsonl` and any fixture added
> in change one, so every fixture on disk is under that check.
> 
> Three. `packages/schemas/test/corpus.position.test.ts` validates a position@v1 example
> built from events that never include `session-started`, so `attempts` is always empty
> and its required fields are never exercised. Build the example from a fold that includes
> a session-started event carrying a runtime, and validate the produced position with the
> schema; keep the existing example too.
> 
> Strict TypeScript, no assertions. Preserve every historical artifact. Append typed
> notes. Run the focused tests and lint before handoff. No push, no merge; the human
> merges.
