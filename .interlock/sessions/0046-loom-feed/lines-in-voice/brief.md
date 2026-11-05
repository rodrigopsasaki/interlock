---
interlock: brief@v1
graph: 0046-loom-feed
node: lines-in-voice
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `lines-in-voice` · graph `0046-loom-feed`

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

> Give each graph in the position one line, tagged with its voice, so a face can say
> where it stands in a sentence without composing one itself. The position gains
> `line`: `{ voice: "observed", text }` composed deterministically from the position in
> the closed vocabulary (held at a named gate; a runtime working a node with how many
> gates left; waiting on a person's gate; ready to start; cleared and not on main;
> reverted on main; done), or `{ voice: "said", who, text, at }` when the node that
> needs attention most has a session whose latest note or question is newer than its
> latest observed change, quoting that note's words exactly. Attention order is held,
> asking, a person's gate open, ready, working, waiting, cleared. Every word in an
> observed line is in the vocabulary (I3); the existing vocabulary check covers the new
> sentences. Each attempt also carries `said`: its latest note (kind, text, at). Gates
> in the position carry their declared `kind` (command, human, and any other declared
> kind) and nodes carry their `acceptance`; the position carries the graph's `ask`, so
> no face reads the graph file beside it. Update schemas/position@v1.json and the terminal
> face, which shows the line under the graph's name. Tests pin one sentence per state
> and the said case. Strict TypeScript. No push, no merge; the human merges.
