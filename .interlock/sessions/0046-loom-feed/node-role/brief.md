---
interlock: brief@v1
graph: 0046-loom-feed
node: node-role
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `node-role` · graph `0046-loom-feed`

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

> Give every node a role, supplied by the graph, never self-declared. graph@v0 nodes
> gain an optional `role`, one of the closed set scout, planner, implementer, tester,
> reviewer, verifier (additive; readers accept its absence forever; an unknown word is a
> readable refusal naming the nearest term, I3). The brief carries it: today's
> `role: worker` in brief front matter stays readable, and a node with a role briefs
> with that role while one without keeps today's behaviour exactly. The opening prompt
> states the role in one sentence per role, saying what that role produces (scout:
> reads and reports, changes nothing; planner: drafts a graph for approval;
> implementer: the diff; tester: the proof the gates run; reviewer: a judgment through
> a named lens; verifier: that every debrief claim is rooted). The position carries
> `role` on each node, absent when the graph names none. `interlock plan` drafts
> graphs whose nodes each name a role. Add the six words to the vocabulary table in
> AGENTS.md and the design note's brief row. Update schemas/graph@v0.json,
> schemas/position@v1.json and the brief schema. Strict TypeScript, no assertions.
> Tests pin: a role parses and reaches brief, prompt and position; absence keeps the
> old brief byte for byte; an unknown role refuses with a sentence. Preserve every
> historical artifact. Append typed notes. No push, no merge; the human merges.
