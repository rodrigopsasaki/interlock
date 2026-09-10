---
interlock: brief@v1
graph: 0001-bootstrap
node: verifier-hunks
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: inverse-check
    kind: command
    run: pnpm --filter verifier --fail-if-no-match test --testNamePattern unexplained
    expect_output: 'Tests +[1-9][0-9]* passed'
scope:
  - packages
  - .interlock/sessions/0001-bootstrap/verifier-hunks
substrate:
  address: none
---
# Brief · node `verifier-hunks` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, **approved** against content sha256 `d650e7738535cd36…`. Do not
  edit the graph file.
- **node:** `verifier-hunks`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `debrief-schema` and `runner-command-gate`, both cleared with receipts in the
  journal.
- **how this session runs:** this is the first node run by `interlock run` itself. The runner
  leased this node, created this worktree at the graph base, wrote this brief into it, started
  you in a herdr pane, and will run the gates and judge the outcome when you stop. Nothing about
  the rules changes because a program briefed you instead of a person.
- **session start SHA:** `git rev-parse HEAD` before you change anything; record it as
  `session_start_sha`. **graph base SHA:** the same value, since the runner created this worktree
  at the graph base.

## Acceptance (verbatim from the graph)

> Deterministic marks over a debrief against its diff at the debriefed SHA: every decision
> cites a hunk that exists; every discovery cites a location that exists with the quoted
> content; every hunk has a decision, or it is marked unexplained; every term is in one of the
> two vocabularies, or it is a gap. Marks never block. Every mark carries its derivation.

## Gates

Standing gates plus the node's own. The runner runs them when you stop; run them yourself to
iterate.

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate 0001-bootstrap verifier-hunks` (real now:
  your `debrief.yaml` must be `debrief@v2` with a because on every decision, and your `notes.yaml`
  must be valid `notes@v0`)
- `inverse-check` — `pnpm --filter verifier test --testNamePattern unexplained`

## Read first

1. `AGENTS.md`: vocabulary (`mark`, `gap`, `derivation`, `decision`, `discovery`), invariants I3
   and I4, the Constraints.
2. `docs/design/0001-interlock.md`: The verifier, Derivation, D6, D21, and the bend log.
3. `packages/ledger/src/mark.ts` (the `Mark` type and its four kinds: rooted, unrooted,
   unexplained, gap; `Gap`), `derivation.ts`, `debrief.ts`, `event.ts` (is there a mark event?
   if not, that is a shape question for `open`, not a coinage).
4. `packages/debrief/src`: the `debrief@v2` reader that yields a `Debrief`; the v0/v1 readers.
5. `packages/runner/src/gateJudge.ts` and `packages/cli/src/run.ts`: where a judged session's
   debrief is ingested, so marks can be produced at the same moment.
6. The six session directories under `.interlock/sessions/0001-bootstrap/`, whose debriefs cite
   hunks in the forms `path` and `path:start-end`, discoveries cite `found_at` as a path, a
   path with lines, a command, or a quoted out-of-band citation, and whose diffs exist in this
   repository's history (`session_start_sha..head_sha` for each). They are your fixtures.

## What the verifier is

A library in `packages/verifier` and one CLI command. Deterministic. No model is called anywhere.

- **Input.** A `Debrief` (v2), the repository, and the range `session_start_sha..head_sha`.
- **Marks, one per claim, plus the inverse.** For every decision: each hunk it cites is
  `rooted` if the path (and line range, when given) exists in the diff of the range, `unrooted`
  otherwise. For every discovery: `rooted` if `found_at` names a path that exists at `head_sha`
  (with the quoted content present when a quote is given), or is a command, or is the
  out-of-band citation form; `unrooted` otherwise. For every file changed in the range: covered
  by some decision's `hunks` or `produces`, or marked `unexplained`, the inverse check. For every
  word used as a type or module name in the range's added lines: in the harness vocabulary, the
  professed domain vocabulary, or plain programming English, or a `gap` with the nearest term.
  Plain programming English is a fixed list you define and record; err toward gap, since a gap is
  telemetry and costs nothing.
- **Marks never block.** The verifier returns marks; it never fails a gate. A standing gate may
  later consume marks; that is a team's choice, not the verifier's.
- **Every mark carries its derivation**: `{ kind: "gate", gate: "verifier-hunks", version,
  runner }` for the deterministic marks. Nothing here carries a model derivation because nothing
  here calls a model.
- **`interlock verify <graph> <node>`.** Reads the session's `debrief.yaml`; a legacy (v0/v1)
  debrief is a sentence saying marks require `debrief@v2`; a v2 debrief yields marks, printed as
  a position of the debrief: counts per kind, then each unrooted and unexplained mark with what
  was expected. Exit zero regardless of marks (they never block); non-zero only for a missing or
  malformed debrief.
- **Ingestion.** When the runner judges a v2 session, marks are recorded beside the debrief.
  Whether the ledger has an event kind for a mark decides the shape question: if `event@v2` has
  none, adding one is a new union arm, a shape change you are not licensed to make; record the
  exact proposal under `open` and print marks without persisting them. If a fitting event exists,
  use it.
- **Errors are sentences**: missing debrief, legacy version, range not in history, malformed
  hunk citation.

## Out of scope

Model-produced marks; consuming marks in a gate; the face's views; the substrate. Do not edit
`AGENTS.md`, either design note, the graph, `.interlock/config.yaml`, or this brief. Do not edit
any prior session's files.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types, tests and module
  boundaries carry the meaning. Never quote AGENTS.md, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`.
- Node pinned by `.node-version`; run everything through `mise exec --`. Verify any new
  dependency on npm and justify it.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop or reconfigure herdr.

## Deliverable

1. Commits satisfying the acceptance, gates green.
2. `notes.yaml` beside this brief (`notes@v0`), appended while you work, committed with the code.
3. `debrief.yaml` beside this brief in **`debrief@v2`** (see `packages/debrief` for the shape and
   the six existing files for examples; `debrief-schema`'s own debrief is v2), as the final
   commit, `head_sha` = last code commit, a because on every decision, decisions a manifest of
   every changed file.
4. In the debrief: the output of `interlock verify 0001-bootstrap debrief-schema` (the one v2
   debrief in the corpus besides yours) and of `interlock verify 0001-bootstrap verifier-hunks`
   on your own debrief, verbatim.

When the debrief is committed, stop and wait. The runner judges from there.
