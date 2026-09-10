# Brief · node `brief-shape` · graph `0002-shapes`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0002-shapes`, **approved** against content sha256 `98df88b9e5ad771f…` by a receipt
  in the repository's shared journal. Do not edit either graph file.
- **node:** `brief-shape`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** nothing in this graph. You build on `packages/debrief` (the debrief and notes
  readers), `packages/face` (graph loader, root discovery) and `packages/runner` (where the
  session brief is written into a worktree).
- **graph base SHA:** the value of `git rev-parse HEAD` before you change anything; record it as
  both `graph_base_sha` and `session_start_sha`, since this worktree was cut at main.
- **branch:** `graph/0002-shapes/brief-shape`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> `brief@v1`: YAML front matter the runner reads (graph, node, role, graph base SHA, the gates
> the runner will run, the scope paths receipts address, the substrate address and its walk
> handle when present) followed by a markdown body the session reads: the acceptance verbatim,
> the context slice rendered as sections whose items carry provenance, constraints, and the
> deliverable. A reader validates a brief and yields its typed front matter; a hand-written
> brief with no front matter validates as `brief@v0`, legacy, and the runner refuses to run a
> node whose brief is legacy. The runner writes the front matter when it creates a session's
> brief from a graph, the standing table and the node. `interlock brief validate <graph>
> <node>`. Every existing brief under `.interlock/sessions/` validates as `brief@v0`.

## Gates

Standing gates plus the node's own:

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate 0002-shapes brief-shape` (real: your debrief
  must be `debrief@v2` with a because on every decision; your notes `notes@v0`)
- `brief-legacy` — `pnpm --filter debrief --fail-if-no-match test --testNamePattern brief`, and
  its output must show at least one passed test

## Read first

1. `AGENTS.md`: vocabulary, Compatibility (shape and version on line one; readers accept every
   prior version forever; additive evolution; a wrong file gets a sentence), Constraints.
2. `docs/design/0001-interlock.md`: The session drilldown (the Brief column and the role rule),
   Compatibility, D1, D4, D20; `docs/design/0003-substrate.md` in full: the slice is typed items
   with provenance that interlock renders into the brief; interlock never walks, the session does
   through a handle the brief carries.
3. `packages/debrief/src` (the version-aware reader pattern you mirror: shape tag on line one,
   legacy versions validate without being ingested, sentence errors with file and line),
   `packages/face/src/document.ts` and `root.ts`, `packages/runner/src/sessionBrief.ts` (where the
   runner writes a session's brief into the worktree today), `packages/runner/src/gateCommand.ts`
   and `standingGates.ts` (the gates the runner will run for a node), `packages/runner/src/scope.ts`
   (the scope receipts address today), `packages/cli/src/main.ts` and `packages/cli/src/run.ts`.
4. Every brief under `.interlock/sessions/` (six in `0001-bootstrap`, this one in `0002-shapes`).
   All are hand-written markdown with no front matter. They are your `brief@v0` fixtures and every
   one of them must validate as `brief@v0`.

## What this node builds

- **The `brief@v1` file.** A YAML front matter block delimited by `---` lines, then a markdown
  body. Front matter, all snake_case: `interlock: brief@v1`; `graph`; `node`; `role`; `gates`, a
  list of `{ id, kind, run, expect_output? }` as the runner will run them (standing table first,
  then the node's own, add-never-remove); `scope`, a list of repository-relative paths receipts
  address (today: the paths git tracks, or a narrower list if the node declares one; record the
  rule you choose); `substrate`, `{ address, handle? }` where address may be `none`; and two
  fields only the runner fills when it writes the session's copy: `graph_base_sha` and `session`.
  In the repository's committed brief these two are absent; in the worktree copy the runner
  writes, they are present. The reader accepts both states and says which it saw.
- **The body.** Markdown the session reads. Sections in this order: the acceptance verbatim; the
  context slice; constraints; deliverable. The slice is rendered from typed items
  (`item@v1`: `kind`, `statement`, optional `because`, `scope`, `standing`, `derivation`) into one
  section per kind, each item a bullet whose last line names its derivation in a fixed short form.
  With a substrate address of `none` the slice section says so in one sentence and is otherwise
  empty. The renderer is a pure function from items to markdown with tests over a fixture slice;
  no substrate client exists yet and none is built here.
- **Readers.** `brief@v0`: a markdown file with no front matter, or with front matter lacking the
  shape tag; validates as legacy-valid with a sentence naming the fields v1 would need; yields no
  typed front matter. `brief@v1`: validates, yields the typed front matter and the body. Errors are
  sentences with file and line: missing tag, unknown tag, missing field, malformed gate, a scope
  path that is absolute or escapes the root, a `role` that is not a plain word.
- **`interlock brief validate <graph> <node>`** (and `--file <path>`): finds the brief in the
  repository root or the worktree, validates, exits zero when valid at any version, non-zero with
  sentences otherwise; says "valid as brief@v0; the runner requires brief@v1" for legacy.
- **The runner writes the front matter.** When `interlock run` copies a node's brief into the
  worktree it now reads the repository's brief: if `brief@v1`, it fills `graph_base_sha` and
  `session` and rewrites the gates and scope from the graph and standing table (the repository
  copy may be stale; the runner's view is authoritative and the two are compared: a difference is
  narrated, never silently overwritten without a line); if `brief@v0`, the runner refuses with the
  sentence "brief for <graph>/<node> is brief@v0; the runner requires brief@v1; add front matter".
  Existing briefs are not edited by you; upgrading them is the harness's act.
- **Where the code lives.** The brief reader and renderer beside the debrief and notes readers,
  in `packages/debrief` (rename the package to `session` only if you judge the three readers
  belong under that name and can do it cleanly; record the choice either way). The CLI command in
  `packages/cli`. The runner change in `packages/runner`.

## Out of scope

The interpreter (nothing produces a brief body from an ask); the substrate client (no `context`
call exists; the renderer takes items from a fixture); JSON Schemas (that is the `schemas` node);
editing any existing brief; the face. Do not edit `AGENTS.md`, either design note, either graph,
`.interlock/config.yaml`, or this brief.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types, tests and module
  boundaries carry the meaning. Never quote AGENTS.md, this brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Reuse the `yaml` dependency; verify any new dependency on npm and justify it.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start, stop or touch herdr.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations recorded.
2. `notes.yaml` beside this brief (`notes@v0`), appended while you work, committed with the code.
3. `debrief.yaml` beside this brief in `debrief@v2`, final commit, `head_sha` = last code commit, a
   because on every decision, decisions a manifest of every changed file (notes and debrief
   included).
4. In the debrief: the output of `interlock brief validate` for every existing brief (all
   `brief@v0`) and for a `brief@v1` fixture you author under `packages/debrief/test/fixtures/`,
   verbatim; and the exact front matter of that fixture.
