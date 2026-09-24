---
interlock: brief@v1
graph: 0043-any-runtime
node: runtime-catalogue
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: lint
    kind: command
    run: pnpm lint
  - id: comments
    kind: command
    run: pnpm check:comments
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: catalogue-runner-proof
    kind: command
    run: pnpm --filter runner exec vitest run test/runtimes.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: catalogue-cli-proof
    kind: command
    run: pnpm --filter cli exec vitest run test/runtime.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: catalogue-schema-proof
    kind: command
    run: pnpm --filter schemas exec vitest run test/runtimes.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages/runner/src/localConfig.ts
  - packages/runner/src/startupAnswers.ts
  - packages/cli/src/main.ts
  - packages/schemas/src
  - schemas
  - docs/shapes.md
  - .interlock/local.example.yaml
substrate:
  address: none
---

# Brief · node `runtime-catalogue` · graph `0043-any-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0043-any-runtime`, approved by Rodrigo Sasaki on 2026-09-24 (receipt
  `7ae05778c386f6f1…`). Do not edit the graph file.
- **node:** `runtime-catalogue`. **role:** worker, supplied here, not chosen by you.
- **depends on:** nothing. It is the first node of the graph.
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha` in the debrief.
- **branch:** `graph/0043-any-runtime/runtime-catalogue`. **worktree:** this directory. Work
  only here.

## Acceptance (verbatim from the graph)

> Add a per-machine runtime catalogue. Shape `runtimes@v0`, a YAML file at
> `$XDG_CONFIG_HOME/interlock/runtimes.yaml` (default `~/.config/interlock/runtimes.yaml`), path
> overridable by the environment variable `INTERLOCK_RUNTIMES` so tests never touch the real
> file. Each entry is a named profile: `kind` (the agent CLI herdr starts, with today's
> `runtime.kind` semantics), `args` (opaque to interlock), `model` (a declared label kept for the
> record, never parsed), and optional `startup_answers` and `startup_timeout_ms` with today's
> semantics. The file is machine truth and is never committed. `runtimes.example.yaml` in the
> repository documents the shape with placeholder entries only and names no vendor.
>
> The existing `runtime:` block in local.yaml keeps working unchanged as the implicit profile
> named `default`. local.yaml gains an optional `default_runtime: <name>`, additive within
> local@v0; readers accept its absence forever. An absent catalogue is an empty catalogue, never
> an error. A malformed entry refuses with a sentence through the established readable-refusal
> surface, naming the nearest vocabulary term (I3). No PATH probing and no vendor knowledge in
> code: whether a profile can start is learned from attempts, never guessed (I6).
>
> Add `interlock runtime list`: name, kind, declared model, and where the profile came from
> (catalogue or local.yaml). A JSON Schema `schemas/runtimes@v0.json` and `interlock schema
> validate` cover the new shape. Strict TypeScript, no assertions, no non-null operators. Tests
> pin: a valid catalogue parses; a malformed one refuses with a sentence; an absent one is
> empty; the legacy `runtime:` block still resolves as `default`; the list renders. Preserve
> every historical brief, debrief, note and receipt. Append typed notes for choices and
> surprises. Run the focused test files and lint before handoff. No push, no merge, no
> deployment; the human merges.

## Why this node exists

Today the runner starts whichever agent CLI this repository's `.interlock/local.yaml` names, so
choosing a model means editing a file per repository. The design says strategy is declared and
model is measured: the model is a variable at each node's attempt. This node builds the
catalogue that later nodes choose from (`interlock run --runtime <name>` is the next node, not
this one). Nothing in this node starts an agent or touches herdr.

## Words

The graph says "profile". The vocabulary is closed and has no such noun. In code, CLI output,
schema titles and tests, an entry of the catalogue is **a runtime**, and the catalogue is **the
runtime catalogue**. The word `runtime` is already established by `I6`, `local.yaml`'s
`runtime:` block and the runner's `Runtime` interface. Do not introduce "profile" anywhere. If
you need a word that does not exist, record it as a gap in the debrief's `open` section with the
nearest term and the difference.

## Gates

Standing gates run by the runner at judgement: `typecheck`, `lint`, `comments`, `test`,
`debrief-valid`. Node gates, run by the runner and by you before handoff:

- `catalogue-runner-proof` — `pnpm --filter runner exec vitest run test/runtimes.test.ts`
- `catalogue-cli-proof` — `pnpm --filter cli exec vitest run test/runtime.test.ts`
- `catalogue-schema-proof` — `pnpm --filter schemas exec vitest run test/runtimes.test.ts`

The gate commands name the test files. Create exactly those files; a gate whose file is missing
fails closed.

## Read first

1. `AGENTS.md`: vocabulary, invariants I3, I5, I6, the Compatibility rules (every artifact names
   `shape@version` on its first line; readers accept every prior version forever; evolution is
   additive; a wrong hand-authored file gets a sentence, not a stack trace).
2. `packages/runner/src/localConfig.ts`: the `local@v0` reader, its `runtime` block
   (`kind`, `args`, `startup_answers`, `startup_timeout_ms`, `prompt_taken_timeout_ms`) and its
   refusal shapes (`missing`, `malformed` with a sentence). The catalogue reader mirrors this
   file's style and reuses its startup-answer validation from
   `packages/runner/src/startupAnswers.ts`. Extend the local reader with the optional
   `default_runtime`; the block stays exactly as it is.
3. `.interlock/local.example.yaml`: document `default_runtime` there, beside the `runtime:`
   block it defaults over, in the same voice.
4. `packages/cli/src/main.ts`: the group/action dispatch. Add the group `runtime` with the
   action `list`. Read how `graph show` and `session show` resolve the repository root and render
   plain text; render the list the same way, one line per runtime.
5. The readable-refusal surface built by graph `0004-readable-refusals` (read its session
   debrief under `.interlock/sessions/0004-readable-refusals/` and the modules it names). Every
   refusal this node adds goes through that surface.
6. `packages/schemas`: how `schemas/*.json` are loaded and validated (ajv, draft 2020-12), and
   `packages/schemas/test/brief.test.ts` as the test pattern. Add `schemas/runtimes@v0.json`,
   list the shape in `docs/shapes.md` where the other shapes are listed, and cover it with
   `packages/schemas/test/runtimes.test.ts`.
7. `packages/cli/src/schema/`: `interlock schema validate` and `schema reference`; the new shape
   must be reachable there like the others.

## What this node builds

- **`runtimes@v0`.** First line `interlock: runtimes@v0`. Then `runtimes:` a mapping from name
  to entry. Name matches `^[a-z][a-z0-9_-]{0,31}$` (the same shape herdr accepts for an agent
  name, so a runtime name can later label a pane). Entry: `kind` (required, string), `args`
  (optional, list of strings, default empty), `model` (required, string, a declared label the
  code never parses), `startup_answers` (optional, today's semantics and validation),
  `startup_timeout_ms` (optional, positive integer). Unknown keys refuse with a sentence naming
  the key and the entry.
- **Location.** `$XDG_CONFIG_HOME/interlock/runtimes.yaml`, default `$HOME/.config/interlock/runtimes.yaml`;
  `INTERLOCK_RUNTIMES=<path>` overrides both. Tests set the override to a temporary directory
  under the package's own `test/` scratch, never the real home. An absent file is an empty
  catalogue. A present but unreadable or malformed file refuses with the file path, the entry
  or key, and what is wrong.
- **The legacy block.** `local.yaml`'s `runtime:` block is the runtime named `default`, source
  `local.yaml`. If the catalogue also defines `default`, refuse with a sentence naming both
  sources; do not pick one. `default_runtime` in `local.yaml` is optional; when present it must
  name a runtime the merged view knows, else refuse with a sentence that lists the known names.
  A `local.yaml` without it reads exactly as today.
- **One merged view.** A function in the runner package that returns the runtimes this
  repository can start: the catalogue's entries plus `default` from `local.yaml`, each with its
  source. This is the function the next node calls to resolve `--runtime`; build it so that
  call needs nothing more than a name.
- **`interlock runtime list`.** One line per runtime: name, kind, model, source. Empty
  catalogue and no legacy block prints one sentence saying so. Refusals print as sentences and
  exit non-zero.
- **Example file.** `runtimes.example.yaml` at the repository root, placeholder names such as
  `fast` and `careful`, placeholder kinds such as `<agent-cli>`, no vendor names, no flags. The
  real file is never committed; add `runtimes.yaml` to nothing, since it lives outside the
  repository.

## Out of scope

`interlock run --runtime` and `plan --runtime`; recording the runtime on the session; the
position; any PATH or executable check; any vendor name or flag in code or tests; the daemon;
the substrate. Do not edit `AGENTS.md`, the design notes, the graph, or this brief.

## Constraints

- **Comments: none in `packages/*/src`.** The `comments` standing gate counts them. Names,
  types, tests and module boundaries carry the meaning. Never quote AGENTS.md, the brief or a
  design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Reuse the `yaml` dependency already present; add no dependency.
- Biome is the formatter and linter (`pnpm lint`); keep `biome.json` untouched.
- Node pinned by `.node-version`; run everything through `mise exec --`. Run the focused test
  files while you work; run the standing gates once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End every
  message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- No files outside this worktree except the temporary directory your tests create under their
  own scratch. No `/tmp`. No `rm -rf`. Never start or stop herdr. Never touch
  `~/.config/interlock`.

## Deliverable

1. Commits satisfying the acceptance; all gates green, run by you before handoff:
   `mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm check:comments`,
   the three node gate commands, and `mise exec -- pnpm interlock debrief validate
   0043-any-runtime runtime-catalogue`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work: every choice with its
   because, every surprise with expected and observed. Committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit, `head_sha` = last code commit,
   a because on every decision, decisions a manifest of the diff (every changed file in some
   decision's `hunks` or `produces`, `notes.yaml` and `debrief.yaml` included), `open` carrying
   the shape's gap log, including the "profile" word.
