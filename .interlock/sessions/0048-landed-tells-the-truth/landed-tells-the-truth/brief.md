---
interlock: brief@v1
graph: 0048-landed-tells-the-truth
node: landed-tells-the-truth
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `landed-tells-the-truth` · graph `0048-landed-tells-the-truth`

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

> Make the landed reading truthful in three cases, all deterministic git
> reads with no model involved.
>
> 1. Partly reverted. Landed gains a kind `partly-reverted-on-main`,
> carrying `main`, `head`, `reverted` and `revertedBy`. Publish the new
> discriminant in position@v2. Preserve schemas/position@v1.json and
> historical fixtures unchanged; register both versions and emit v2 from
> positionOf. Preserve existing Landed variants' shapes. Define reverted
> as original attempt commit SHAs in attempt order, and revertedBy as a
> mapping from each listed SHA to its full undo commit SHA, with exactly
> matching keys. Update POSITION_SHAPE, the active typed Position fixture in packages/face/test/faceReducer.test.ts, latest-output assertions, CLI JSON output tests and schema coverage. Tests validating positionOf output must select position@v2; retain separate fixed position@v1 compatibility fixtures. Retain v1 compatibility fixtures. A position containing a partly-reverted-on-main node must have done: false; isNodeDone must continue accepting only on-main. The consumers to update are
> the ones that exist: isNodeDone (which accepts only on-main), the
> position schema registry and the CLI JSON output; the text and terminal
> renderers omit Landed today and stay so.
>
> A commit of the attempt counts as undone on main when a main commit
> descending from its identified main landing counterpart carries a revert
> line naming that counterpart or the original attempt commit, or, with no
> relevant revert line, when that main commit's stable patch id equals the
> stable patch id of the attempt commit's inverse (`git diff <c> <c>^`). The no-trailer
> detector recognizes stable inverse-patch equivalence under identical,
> explicit diff options and path scope; it does not recognize every manual
> undo. An undo must descend from the identified main landing counterpart,
> not merely occur later in log output. Unresolved overlapping later edits
> read unknown. A later revert of the undoer or matching forward-patch
> reapplication also reads unknown. Emit partly-reverted-on-main only when
> some units are proved undone and every remaining unit is still
> established as landed; otherwise read unknown. When every unit is undone,
> the reading stays `reverted-on-main`, as today. A squash is one unit: its
> undo must name the squash landing commit or match the whole inverse of
> base..head. A trailer naming one constituent commit does not prove the
> whole squash undone.
>
> 2. Ambiguous squash. Preserve the existing unknown result for a
> partially landed set of commits. Otherwise, after ancestry, per-commit
> equivalence and whole-patch matching fail, inspect commits reachable
> from the captured main SHA but not from the attempt's base. Return
> not-on-main only when none touches an attempt-changed path. Otherwise
> return unknown. Path overlap is conservative possible-landing evidence:
> an unrelated edit elsewhere in the same file intentionally returns
> unknown. Name the candidate with the largest number of distinct shared
> paths, breaking ties by earliest committer timestamp and then full SHA;
> include its SHA and the shared-path count out of the attempt's distinct
> path count.
>
> 3. Cached redraws. Retain one repository-scoped mainLineReader/cache for
> the face process lifetime and pass it through buildPlansWorld and
> buildGraphWorld. At each world refresh, resolve the selected main branch
> and SHA once, shared across all graphs and nodes. Every comparison uses
> that immutable SHA; the outward main field retains the branch name.
> Cache successful judgments by (main branch, main SHA, cleared head SHA,
> base SHA). An unchanged refresh whose requested keys all have successful
> cached judgments performs only the shared main snapshot read and zero
> per-node git reads. A screen-only redraw performs none. Main movement
> invalidates every entry keyed by the previous SHA. Do not persist the
> cache. A judgment caused by a failed git read or an unavailable required
> head/base object is not cacheable; retry it on a later refresh even when
> its key is unchanged. Deterministic unknown results from complete,
> successful reads may be cached.
>
> Tests, in packages/face/test/landed.test.ts, each in a real temporary
> repository built by the test. Use three independently reversible commits
> in disjoint files and capture their exact SHAs. Test one exact manual
> inverse without a revert trailer, one trailer-based undo, and all three
> exact inverses in separate commits without trailers. Assert complete
> expected payloads, including original commit/undoer pairings. Add an
> inverse with changed context, an inverse followed by forward
> reapplication, and a squash undone by its whole inverse. Build an actual
> conflict-resolved squash and assert that neither its individual nor
> whole patch IDs match before asserting unknown. Add both a never-landed
> attempt followed by an unrelated same-file edit and a no-shared-path
> control. Test candidate ranking and ties, asserting the named SHA and
> overlap count. Test a cherry-picked unit reverted by a trailer naming its
> main counterpart; assert that the original attempt SHA maps to the
> undoer's full SHA.
>
> Create packages/schemas/test/landed.test.ts covering code-produced
> latest positions for every Landed kind, retained v1 fixtures, absent
> landed, done: false for partial reverts, and rejection of missing or
> malformed new evidence fields. Create
> packages/cli/test/face/landedCache.test.ts: with an injected runner
> delegating to real git, exercise consecutive world refreshes through the
> CLI lifecycle with multiple graphs and cleared nodes. Assert one shared
> main snapshot resolution per refresh, zero per-node reads on an
> unchanged refresh, one judgment when only one node's head or base
> changes, and fresh judgments for all entries when main changes. Assert
> zero reads for a screen-only redraw. Inject a transient per-node git
> failure and assert that an unchanged refresh retries the failed key while
> reusing successful cached judgments.
>
> Strict TypeScript, no assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No
> push, no merge; the human merges.
