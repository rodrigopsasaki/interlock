---
interlock: brief@v1
graph: 0048-landed-tells-the-truth
node: brief-follows-acceptance
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `brief-follows-acceptance` · graph `0048-landed-tells-the-truth`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0048-landed-tells-the-truth.yaml`): why this graph exists and what is out of scope.
3. `docs/design/0001-interlock.md` where the acceptance touches an artifact version, and the files and
   tests the acceptance names.
4. The acceptance below, verbatim from the graph.

## Constraints

- No comments in `packages/*/src`. Strict TypeScript; no `as`, `!`, `any`, `as unknown as`.
- Every existing artifact, journal line and schema version still reads and validates; a version is
  published only where the acceptance says so.
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
   anything the acceptance did not foresee.

## Acceptance (verbatim from the graph)

> A node's authored brief can fall behind its graph. On 2026-11-05 a
> node's acceptance in another repository was rewritten three times
> after its brief was authored, and the runner started a session on the
> old brief body because it reconciles only the brief's front matter
> (role, gates, scope) with the graph. The worker built the smaller,
> older spec while the gates judged the newer one.
>
> When the runner materializes a brief for a session, it also
> reconciles the brief's "Acceptance (verbatim from the graph)" section
> with the acceptance from the same approved node declaration that
> supplies the session's recorded brief and node gates, even when a
> reused worktree has an older `graph_base_sha`. If the two differ, it
> replaces that section's body with the declaration's acceptance, quoted
> the same way, and reports the rewrite through the existing narration
> channel it uses for front-matter diffs, naming the node and that the
> acceptance changed. Comparison removes one blockquote marker and at
> most one following space per quoted line, normalizes line endings and
> excludes section-padding blank lines; it preserves whitespace
> belonging to the acceptance itself. Acceptance reconciliation
> preserves every body byte outside the section it replaces. Existing
> front-matter reconciliation and generated debrief-guidance, walk and
> context-slice transformations continue unchanged.
>
> For an otherwise valid brief@v1 without this section, append the
> canonical quoted acceptance section to the materialized copy and
> report its addition through the existing narration channel. The
> opening view identifies this section as authoritative over acceptance
> text elsewhere in the authored prose. Existing brief readers and
> repository files remain unchanged; the authored brief file in the
> repository is never edited by the runner.
>
> Tests: a matching acceptance section is retained byte for byte and
> produces no acceptance-rewrite narration; a stale section is replaced
> and reported, with outside bytes preserved by acceptance
> reconciliation and existing generated-body transformations retained;
> an existing brief@v1 without the section materializes successfully
> with the authoritative acceptance appended and its addition reported;
> every existing brief remains readable; a whitespace-only difference in
> quoting is not reported as a change. In packages/cli/test/run.test.ts,
> cover a reused worktree with an older base and prove that the
> materialized acceptance, recorded brief and node gates use the same
> approved declaration. Strict TypeScript, no assertions, no non-null
> operators. Preserve every historical artifact. Append typed notes for
> choices and discoveries. No push, no merge; the human merges.
