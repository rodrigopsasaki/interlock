---
interlock: brief@v1
graph: 0046-loom-feed
node: position-everything
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `position-everything` · graph `0046-loom-feed`

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

> One read returns the position of every graph in every repository a face asks about.
> `interlock position --json [--repo <path>]...` (default: the current repository)
> prints `positions@v0`: for each repository its root, its origin when one is set,
> whether its journal read (or `unreadable` with the line that failed), and every graph:
> the position@v1 of each graph that loads, and for each graph file that does not load,
> its id with `unreadable` and the loader's refusal as the because. A journal that
> cannot be read never reads as an empty one, and a graph file that cannot be parsed
> never disappears (the face says unknown rather than a wrong count). Also prints, per
> repository, the live attempts across all graphs with role, runtime and agent status,
> so a face can show who is in a pane without a second read. Nothing is cached between
> calls. Add schemas/positions@v0.json and the schema validate case. `interlock graph
> show --json` is unchanged. Tests pin: two repositories in one read; an unreadable
> journal; an unparseable graph file; the live-attempt list. Strict TypeScript. No push,
> no merge; the human merges.
