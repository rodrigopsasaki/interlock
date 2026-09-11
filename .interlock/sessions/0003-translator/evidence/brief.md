---
interlock: brief@v1
graph: 0003-translator
node: evidence
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
  - id: evidence-provenance
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test --testNamePattern evidence
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - .interlock/sessions/0003-translator/evidence
substrate:
  address: none
---

# Brief · node `evidence` · graph `0003-translator`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0003-translator`, approved by a receipt in the repository's shared journal.
- **node:** `evidence`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `substrate-client`, cleared: `packages/substrate` exists with `absorb`.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> The upward translation, deterministic: from a judged session, `item@v1` evidence with
> provenance. Receipts become observed items with gate derivation; decisions and discoveries
> become hypotheses with model derivation, each carrying the rooted hunk or location, unrooted
> marks excluded and counted; a person's verbs with their because become professed items with
> human derivation. `interlock evidence <graph> <node>` prints the items and the gap count;
> `absorb` sends them. Nothing here ratifies.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: the vocabulary, invariants I3 and I4, Compatibility, Constraints, the fence.
2. `docs/design/0003-substrate.md`: Payloads (the item, its kinds, standings and derivation),
   D23, D24. `docs/design/0001-interlock.md`: D6, D7, Derivation.
3. `schemas/item@v1.json` (kind, statement, because, scope, standing, derivation as a string),
   `schemas/substrate/absorb.request.json` and `absorb.response.json`, `schemas/parts/gap.json`.
4. `packages/verifier/src` (marks: rooted, unrooted, unexplained, gap; how a decision's hunks and
   a discovery's `found_at` are rooted), `packages/ledger/src/{debrief,derivation,mark,receipt,
   outcome,gate}.ts`, `packages/cli/src/{node/cancel,node/reset,gate/waive,graph/approve}.ts`
   (a person's verbs carry `authority` and `because`), `packages/substrate/src`.

## What this node builds

- **`evidenceOf(session)`** in `packages/substrate`, a pure function from a judged session's
  view (its debrief, notes, the node's receipts and outcome, the verifier's marks, and the
  gate-moved and outcome-set events a person wrote with an authority) to a list of `item@v1`:
  each receipt an item of kind `decision`? No: a receipt is what the gate observed; use kind
  `discipline` for a satisfied standing gate and `risk` for a blocked one only if the vocabulary's
  own kinds fit, otherwise record the mapping you choose and why, once, in the debrief; standing
  `observed`; derivation the string form of the receipt's gate derivation. Each rooted decision
  an item of kind `decision`, statement `what`, `because` carried, scope the paths of its hunks,
  standing `hypothesis`, derivation the debrief's runtime and model. Each rooted discovery an
  item of kind `absence` when it names something missing and `risk` or `tension` when it names a
  conflict, else `decision`; record the rule. Unrooted marks are excluded and counted; the gap
  marks travel as `gaps` in the absorb request. A person's verb with its because (approve, cancel,
  reset, waive) is an item of kind `decision`, standing `professed`, derivation `human:<authority>`.
  Every rule is deterministic; no model is called.
- **`interlock evidence <graph> <node> [--session <id>]`** prints the items as YAML with a
  header line of counts (items by kind and standing, gaps, unrooted excluded) and exits zero; a
  node with no judged session gets a sentence.
- **`absorb` sends them.** The client's `absorb` call the previous node built now carries the
  evidence beside the debrief, notes and receipts, in whatever field the `absorb.request` schema
  allows; if the schema has no field for items, add one as an optional array of `item@v1` in
  `schemas/substrate/absorb.request.json` (additive), regenerate `docs/shapes.md` if it lists
  it, and record the shape change in the debrief. The acknowledgement's `gaps` come back and are
  narrated.

## Out of scope

Any model call; ratification of anything; the interpreter; any substrate implementation;
`AGENTS.md`; design notes; graphs; `.interlock/config.yaml`; this brief; other sessions' files.

## Constraints

- **Comments: none in `packages/*/src`.** Never quote `AGENTS.md`, this brief or a design note in
  code. Never name any substrate implementation.
- Strict TypeScript; no `as`, `!`, `any`, `as unknown as`. No new dependencies. Small files named
  for the vocabulary.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit as you go. **Do not push.** Every message
  ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, `git reset --hard`, `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), committed as you go.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, a because on every
   decision, decisions a manifest of every changed file.
4. In the debrief: `interlock evidence 0001-bootstrap verifier-hunks` verbatim (the first real v2
   debrief with marks), and the mapping table from artifact to item kind and standing.

When the debrief is committed, stop and wait. The runner judges from there.
