---
interlock: brief@v1
graph: 0046-loom-feed
node: say-into-pane
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `say-into-pane` · graph `0046-loom-feed`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0046-loom-feed.yaml`): why this graph exists and what is out of scope.
3. The contract this graph feeds: `cockpit/loom/schema.ts` (loom@v0) in the preston repository
   (`~/dev/private/preston`, read-only). Every field you add to the position must map onto it.
4. The acceptance below, verbatim from the graph, and the files and tests it names.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
- Additive only: every existing artifact, journal and schema version still reads and validates.
- Nodes in this graph run as a chain because each touches the position; build on the previous node's commits.
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
   anything the acceptance did not foresee, including any loom@v0 field this node could not fill.

## Acceptance (verbatim from the graph)

> Let a person put words into a live session's pane from any face, on the record.
> `interlock session say <graph> <node> <text> --by <name> [--because <why>]` delivers
> the text as a prompt to the live attempt's agent through the multiplexer adapter
> (the herdr adapter's existing prompt delivery; no herdr call outside it, I6), and
> appends a ledger fact `person-said` carrying session, by, text, at and, when present,
> the question it answers. The fact is persisted before delivery and its delivery is
> recorded as delivered or uncertain, never assumed (I7). Refuses with a sentence when
> the node has no live attempt, when the pane can't be found, or when --by is missing.
> The position's attempt gains `heard`: the last person-said on that attempt (by, text,
> at), and a person-said after a question closes that question's `asking`. event@ gets
> the next version with an upcaster so every older journal replays unchanged; update
> the event schema and the corpus check. Tests pin: delivered, refused with no live
> attempt, uncertain when the adapter fails after the intent is written, question
> closed, older journals replay. Strict TypeScript. No push, no merge; the human merges.
