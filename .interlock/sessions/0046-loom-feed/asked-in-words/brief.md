---
interlock: brief@v1
graph: 0046-loom-feed
node: asked-in-words
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `asked-in-words` · graph `0046-loom-feed`

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

> When a session waits on a person, the position carries what it asked, in its words.
> notes@v0 gains a third note kind, `question`: `at`, `asked` (the question as the
> session would say it to the person), optional `options` (short answers it would
> accept). Additive; every existing notes file still validates. The opening prompt and
> the brief's authoring guidance tell the session: before you stop to wait for a person
> in your pane, append a question note, then ask in the pane as you do today.
>
> The position's attempt gains `asking`, present only while the attempt's agent status
> is blocked: `{ asked, options?, at }` from the latest question note not yet answered,
> or `{ asked: null, because }` when the session is blocked and wrote no question, the
> because saying so in plain words. The face never invents the words and never reads
> them off the pane's screen. A question counts as answered when a person's words
> reach the pane after it (node say-into-pane) or the attempt ends. Update
> schemas/notes@v0.json and schemas/position@v1.json. Tests pin: blocked with a
> question shows its words; blocked without one shows null with the because; working
> shows no asking; an answered question stops showing. Strict TypeScript. Preserve every
> historical artifact. Append typed notes. No push, no merge; the human merges.
>
> A `question` note enters the journal through note-appended, so this node owns the event change: the next event version, the embedded-note schema, an upcaster for every older version, and a replay gate. `asking` with no question is `{ asked: null, because, at }`, `at` being when the blocked status was observed.
