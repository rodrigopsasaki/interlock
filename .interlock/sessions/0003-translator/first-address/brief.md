---
interlock: brief@v1
graph: 0003-translator
node: first-address
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
  - id: witnessed
    kind: human
  - id: absorb-acknowledged
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test --testNamePattern acknowledged
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - docs/design/0003-substrate.md
  - .interlock/sessions/0003-translator/first-address
substrate:
  address: none
---

# Brief · node `first-address` · graph `0003-translator`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0003-translator`, approved by a receipt in the repository's shared journal.
- **node:** `first-address`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `evidence` and `interpreter`, cleared.
- **how this session runs:** `interlock run` leased this node with the repository's
  `.interlock/local.yaml` pointing `substrate.address` at a local `http` substrate for the first
  time. Your own brief therefore carries a rendered context slice below, if the address answered.
  When you stop, the runner absorbs your debrief there too.

## Acceptance (verbatim from the graph)

> This repository runs with a substrate at a local `http` address: the briefs of this graph's
> later sessions carry a rendered slice; their debriefs are absorbed and the acknowledgement
> narrated; each debrief's discoveries are counted against its slice. A person witnesses one
> brief with a slice and one absorbed debrief and records it as a receipt.

## Context slice

Rendered by the runner from the address when this session started; empty if the address is
`none` or did not answer.

## Read first

1. `AGENTS.md`: I5 (the harness runs with the address set to none), the fence, Constraints.
2. `docs/design/0003-substrate.md` (v1.0) in full; its bend log is where you write what the first
   real address taught.
3. `packages/substrate/src` (client, evidence), `packages/cli/src/{run,judge}.ts` (where `absorb`
   is called and narrated), `packages/ledger/src/projection.ts` (`SessionView.narration`),
   `interlock session show` (the narration a person reads).
4. This session's own brief file in the worktree: the slice the runner rendered into it, or the
   sentence saying none came.

## What this node builds

- **The count.** At judgement, when a debrief is absorbed, the runner counts the debrief's
  discoveries against the slice its brief carried: a discovery that names something the slice
  already stated is `known`; one the acknowledgement placed is `new`; one it could not place is
  `unplaced`. The counts are narrated on the session and written as a `session-narrated` line
  in a fixed form the face can read. Where the acknowledgement's `discoveries` already say this,
  use it; where the substrate declared no such detail, count what can be counted (the slice's
  items against the discoveries' statements by exact reference) and say the rest is unknown.
- **The tests**, named so the gate finds them (`acknowledged`): against the fake substrate
  server the client node built, a cleared session's absorb acknowledgement is narrated with its
  counts; a held session's too; an address that stops answering mid-run degrades to a narrated
  refusal and the judgement still completes.
- **The witness.** The `witnessed` gate is a person's: they read one brief that carried a slice
  from the real address and one absorbed debrief's narration in `session show`, and record it with
  `interlock gate waive` or a receipt-writing verb that exists for a human criterion; if none
  exists for a node-level human gate yet, build the smallest one (`interlock gate witness <graph>
  <node> <gate> --by --because`, writing a `gate-moved` to satisfied with a human derivation) and
  record it as a decision. The person does this after you stop; your debrief says what they will
  see.
- **The bend-log row** in `docs/design/0003-substrate.md`: what the first non-none address bent,
  against which decision, and the way back. The reference implementation stays named once, in
  the mapping section; you do not name it.

## Out of scope

Any substrate implementation; changing the protocol's verbs or schemas (a mismatch found against
the real address is a finding for `open` and for the bend log, not a schema edit here);
`AGENTS.md`; the other design notes; graphs; `.interlock/config.yaml`; this brief; other sessions'
files.

## Constraints

- **Comments: none in `packages/*/src`.** Never quote `AGENTS.md`, this brief or a design note in
  code. Never name the substrate implementation anywhere you write.
- Strict TypeScript; no `as`, `!`, `any`, `as unknown as`. No new dependencies. Small files named
  for the vocabulary.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit as you go. **Do not push.** Every message
  ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, `git reset --hard`, `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal.
  Tests never call the real address; only the runner does, once, when it briefed you.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter,
   except `witnessed`, which the person satisfies after reading.
2. `notes.yaml` beside this brief (`notes@v0`), committed as you go.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, a because on every
   decision, decisions a manifest of every changed file, discoveries naming what the slice in
   your own brief got right and what it missed.
4. In the debrief: the slice your brief carried, verbatim, and the narration lines the counting
   produces from a test, verbatim.

When the debrief is committed, stop and wait. The runner judges from there.
