---
interlock: brief@v1
graph: 0046-loom-feed
node: role-shapes-the-session
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `role-shapes-the-session` · graph `0046-loom-feed`

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

> Make the role decide the session, not just label it. Rodrigo, 2026-11-04 23:28: "the
> type of session defines the brief/debrief it gets, what makes sense to retrieve from
> Preston and what does not. The planner, the coder and the reviewer get different
> prompts with different walks, but they all get to walk the same graph should they want
> to." Add a role table `roles@v0` (repository default in the package, overridable per
> repository at `.interlock/roles.yaml`, additive): for each of the six roles, the
> opening prompt's role paragraph, which debrief kinds it must return (implementer:
> decisions rooted in hunks; tester: the proof and what it pins; reviewer: findings
> through its named lens, no diff; scout: discoveries, no diff; planner: a graph file;
> verifier: marks), and its walk: the substrate questions its brief asks first, by the
> substrate's three verbs and the address (I5: with the address none the walk is empty
> and the brief says so; nothing errors). The walk is a starting point, never a fence:
> the brief also says the whole substrate is open to the session through its address,
> so any role may walk anywhere it wants. A node without a role keeps today's brief
> byte for byte. The debrief validator checks the kinds its role requires and holds the
> node with a sentence when they are missing. The position's attempt gains `brief`
> (path, role, the walk it was given) and `debrief` (path, version, kinds present, marks
> counted by mark) so a face can show what a session was told and what it returned
> without opening files. Update the brief, debrief and position schemas. The substrate
> stays named generically (the wall). Tests pin, per role: prompt paragraph, required
> debrief kinds, the walk with an address and with none, and the position fields.
> Strict TypeScript. No push, no merge; the human merges.
