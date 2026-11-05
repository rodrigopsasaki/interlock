---
interlock: brief@v1
graph: 0047-worktree-commits
node: common-git-writable
role: implementer
gates: []
scope: []
substrate: { address: none }
---

# Brief · node `common-git-writable` · graph `0047-worktree-commits`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Read first

1. `AGENTS.md`: vocabulary, invariants, Compatibility, conventions (no comments in
   `packages/*/src`; strict TypeScript; Biome; Conventional Commits).
2. The graph's `read` (in `.interlock/graphs/0047-worktree-commits.yaml`): why this graph exists and what is out of scope.
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

> Give a sandboxed agent exactly the writable root it needs to commit in a
> node's worktree, and nothing more.
>
> `writable_root_args` is optional, on runtimes@v0 entries and on the
> legacy local.yaml `runtime:` block alike. When present, it is a
> non-empty list of strings with exactly one element equal to the literal
> `{path}`; no other element contains `{path}`. That element is replaced
> with the resolved directory as one argv element, with no shell
> evaluation or splitting. Both readers reject non-lists, empty lists,
> non-string elements, and missing, repeated or embedded placeholders,
> through their existing typed malformed-configuration refusal and
> explanation functions, naming `runtimes.<name>.writable_root_args` or
> `runtime.writable_root_args` (I3; no newly coined face state). Test every
> rejected form, and a valid path containing spaces and quotes.
>
> For each attempt whose runtime entry declares `writable_root_args` and
> whose node uses a linked worktree, resolve the absolute common git
> directory through worktree.ts with `git rev-parse --path-format=absolute
> --git-common-dir`. Append the expanded template after the original
> args, without mutating the entry. Derive no other root, and change
> neither the sandbox mode nor network access. Literal catalogue arguments
> remain trusted operator configuration. Narrate the path supplied to the
> runtime. A resolution failure returns a readable refusal before
> `openPane` or `startAgent`. Without the field, or for a non-linked
> worktree, the original argv is preserved without expansion. Add no
> runtime-specific branch, flag, binary or assumption outside its adapter;
> production code treats the template arguments opaquely (I6).
>
> After `startAgent` succeeds, retain the JSON-encoded effective argv
> through the existing recorded session narration, and assert that it
> equals the argv `startAgent` received. A refused start produces no
> successful-start record. This node changes no persisted session or
> event shape.
>
> Update schemas/runtimes@v0.json and schemas/local@v0.json with identical
> template constraints. In packages/schemas/test/runtimes.test.ts, test
> absence, valid declarations and every malformed form against both
> schemas. Update runtimes.example.yaml and .interlock/local.example.yaml
> with neutral examples of the new field. Add a "Runtime catalogue
> arguments" rationale subsection under Compatibility in the design note,
> preserving existing bend-log rows and historical artifacts.
>
> Wiring tests: inject a Runtime into `driveInteractiveSession` and assert
> the exact argv `startAgent` receives; zero pane and start calls on a
> resolution failure; unchanged argv without the field and for a
> non-linked worktree; and independent argv across two attempts sharing
> one immutable runtime entry. Cover both the catalogue and the legacy
> configuration through merge and selection.
>
> Sandbox proof, in packages/runner/test/writableRoot.test.ts: use a fake
> runtime with the neutral arguments `["--test-write-root", "{path}"]`, and
> build its sandbox permissions from the argv supplied by the production
> launch. Create an isolated repository and a real linked worktree, and
> stage a non-empty change before launching the fake agent. Set a fixture
> git identity, disable signing and hooks, and isolate inherited git
> configuration and repository variables. On macOS, canonicalize fixture
> paths and escape sandbox-policy strings; allow filesystem reads, but
> allow file writes only beneath cwd and the supplied roots. With cwd
> alone, the commit must fail and HEAD must stay unchanged. With the same
> fixture and the resolved common git directory added, the commit must
> succeed: assert HEAD advances and contains the staged change. Under that
> grant, writing into a pre-created writable directory outside both roots
> must fail and leave no file. A sandbox initialization failure on macOS
> fails the test. Other platforms print a skip reason and do not satisfy
> the proof. Emit `writable-root-sandbox-proof: passed` only after all
> three assertions succeed.
>
> Strict TypeScript, no assertions, no non-null operators. Preserve every
> historical artifact. Append typed notes for choices and discoveries. No
> push, no merge; the human merges.
