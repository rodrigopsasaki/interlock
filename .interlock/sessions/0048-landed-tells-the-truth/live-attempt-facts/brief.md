---
interlock: brief@v1
graph: 0048-landed-tells-the-truth
node: live-attempt-facts
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `live-attempt-facts` · graph `0048-landed-tells-the-truth`

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

> Two additions to the position that `interlock position --json` prints.
>
> 1. Every live attempt, in every repository asked about, carries a
> `pane` and a `startedAt`. `startedAt` is the runner clock's
> epoch-millisecond wall time captured when it appends
> `session-started`. Record it as an optional top-level field on that
> event, validate it, and project it into `SessionView`. New
> runner-started sessions record it; historical and backfilled sessions
> without it report unknown with a reason. Never infer it from lease
> expiry, configured lease duration, narration or file timestamps. Test
> runner recording, replay and historical absence. This placement can
> remain event@v9: its top level is open and existing readers ignore
> extra keys.
>
> Publish `positions@v1` with required `pane` and `startedAt` fields on
> every live attempt. Each field is a closed known/unknown union: known
> requires a string pane address or numeric epoch-millisecond start
> respectively; unknown requires a nonempty `because`. Reject bare
> values and mixed branches. Retain the unchanged v0 schema and support
> v0 reads forever, interpreting absent facts as unknown without
> rewriting historical artifacts. Test both versions. The pane address is
> opaque: no reader parses it.
>
> Add a bulk-observation seam to `Runtime`. For a `positionsOf`
> invocation with live attempts, obtain one observation shared across
> every asked repository and graph. The herdr adapter performs one
> `agent.list` and resolves pane and agent status from that result using
> graph, node and session identity. Keep protocol calls and parsing
> inside the adapter. Missing capability, failed observation, unknown
> session or missing pane produces an unknown pane with a reason.
> Runtime unavailability does not erase a recorded start time. Test one
> observation across multiple graphs in two repositories.
>
> 2. lines-in-voice: when `attentionOf` selects the approval standing
> with approval `not-approved`, `observedText` returns exactly "Drafted
> and waiting for your approval." Preserve stale-approval text and
> standing priorities. Add `drafted`, `waiting` and `approval` to
> AGENTS.md's Vocabulary table; add only `and`, `for` and `your` beside
> `at` in the I3 test's fixed grammar-word list. Strip sentence
> punctuation from token boundaries for observed-line vocabulary
> checking only. Preserve exact rendered text and said quotations.
> Update the existing sentences table so exact-output and I3 checks
> exercise this sentence.
>
> Strict TypeScript, no assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No
> push, no merge; the human merges.
