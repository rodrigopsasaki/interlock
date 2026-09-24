---
interlock: brief@v1
graph: 0043-any-runtime
node: run-with-runtime
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
  - id: selection-proof
    kind: command
    run: pnpm --filter runner exec vitest run test/runtimeSelection.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: session-runtime-proof
    kind: command
    run: pnpm --filter ledger exec vitest run test/runtime.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: run-flag-proof
    kind: command
    run: pnpm --filter cli exec vitest run test/run.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages/runner/src
  - packages/ledger/src
  - packages/cli/src
  - packages/face/src
  - schemas
  - docs/shapes.md
substrate:
  address: none
---

# Brief · node `run-with-runtime` · graph `0043-any-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0043-any-runtime`, approved by Rodrigo Sasaki on 2026-09-24 (receipt
  `7ae05778c386f6f1…`). Do not edit the graph file.
- **node:** `run-with-runtime`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runtime-catalogue`, cleared at `0492fdc` and already in your history. Its
  debrief is at `.interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml`; read it
  before the code.
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0043-any-runtime/run-with-runtime`. **worktree:** this directory. Work
  only here.

## Acceptance (verbatim from the graph)

> Choose the runtime per attempt. `interlock run <graph> <node> --runtime <name>` and
> `interlock plan ... --runtime <name>` select a profile from the catalogue. Resolution order:
> the flag, then local.yaml `default_runtime`, then the legacy `runtime:` block as `default`. An
> unknown name refuses with a sentence that lists the known names. Nothing in a graph names a
> runtime; the choice is the caller's at each attempt (strategy declared, model measured).
>
> Record the choice where the session is recorded. The event that opens a session carries
> `runtime: { name, kind, model }` as typed additive fields; the persisted event shape advances
> to event@v6 with an upcaster from every prior version, and a replayed pre-v6 session reads
> its runtime as `unknown`, never invented. Every fixture journal under
> packages/ledger/test/fixtures must still replay. The runner's narration names the runtime
> when the pane opens. `interlock session show` prints it. `interlock graph show` shows the
> runtime of each node's live or latest attempt. `interlock runtime list` gains the last
> attempt per profile, outcome and when, from the projection, so "can this profile start on
> this machine" is answered by the record.
>
> Strict TypeScript, no assertions, no non-null operators. Tests pin: flag beats default beats
> legacy; an unknown name refuses with the list; the v5 fixture upcasts to `unknown`; the
> narration line; the list column. Preserve every historical artifact. Append typed notes. Run
> the focused test files and lint before handoff. No push, no merge; the human merges.

## Why this node exists

`runtime-catalogue` built the catalogue and `mergeRuntimes` (packages/runner/src/runtimeCatalogue.ts):
a `ReadonlyMap<string, ResolvedRuntime>` plus `defaultRuntime`. Nothing reads it yet: the
runner still starts `local.yaml`'s `runtime:` block on every attempt. After this node the person
at the door says `--runtime luna` and the record says which runtime a node ran on. The next node
of this graph is run with `--runtime luna` and the one after it with `--runtime k3`; if either
cannot be told apart in `session show` and `graph show`, this node is not done.

## Words

An entry of the catalogue is **a runtime**; the graph's "profile" is not a word here (see the
previous debrief's `open`). A node's **attempt** is one session on it; "live or latest attempt"
means the session with a live lease if any, else the most recent session. Never introduce
"profile". If you need a word that does not exist, record a gap in the debrief's `open`.

## Gates

Standing gates run by the runner at judgement: `typecheck`, `lint`, `comments`, `test`,
`debrief-valid`. Node gates, run by the runner and by you before handoff:

- `selection-proof` — `pnpm --filter runner exec vitest run test/runtimeSelection.test.ts`
- `session-runtime-proof` — `pnpm --filter ledger exec vitest run test/runtime.test.ts`
- `run-flag-proof` — `pnpm --filter cli exec vitest run test/run.test.ts` (exists; extend it)

Create exactly the two new files the gates name; a gate whose file is missing fails closed.

## Read first

1. `AGENTS.md`: vocabulary, I3, I6, I8, and Compatibility: persisted journal events carry their
   shape version from the first byte; replay routes through a versioned upcast seam; an unknown
   shape is a typed refusal distinct from a truncated tail; evolution is additive.
2. `.interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml` and `notes.yaml`: what
   the previous session built and why, including `ResolvedRuntime` (not `Runtime`, which is the
   pane-driving adapter interface in `packages/runner/src/runtime.ts`).
3. `packages/runner/src/runtimeCatalogue.ts` and `localConfig.ts`: `loadRuntimeCatalogue`,
   `mergeRuntimes`, `MergedRuntimes.defaultRuntime`, `DEFAULT_RUNTIME_NAME`, `LocalConfig.runtime`.
4. `packages/runner/src/sessionDrive.ts`: the one driver that leases, prepares the worktree,
   writes the brief, opens the pane, starts the agent, prompts and waits. Find where it takes
   `localConfig.runtime` (kind, args, startupAnswers, startupTimeoutMs) and hand it a
   `ResolvedRuntime` instead. `packages/cli/src/run.ts` and `packages/cli/src/plan.ts` are its
   two callers; `packages/cli/src/flags.ts` has `parseFlag`.
5. `packages/ledger/src/event.ts` (`session-started` carries `Session`; `lease-taken`,
   `session-narrated`), `session.ts` (the `Session` type and `isSession`), `envelope.ts`
   (`EVENT_SHAPE`, `shapeTag`, `upcastTable`), `upcast/v1.ts`, `v2.ts`, `v3.ts` (how prior
   shapes upcast; find how v4 and v5 are handled), `replay.ts` or wherever replay refuses on an
   unknown shape. `schemas/event@v5.json` is the current schema; the fixtures under
   `packages/ledger/test/fixtures/` are real journals.
6. `packages/ledger/src/projection.ts` (or the module that builds `SessionView` and node
   attempts): where a session's data becomes readable.
7. `packages/cli/src/session/show.ts`, `packages/cli/src/graph/show.ts`,
   `packages/face/src/nodeRow.ts`, `attempts.ts`, `sessionColumns.ts`, `position.ts`: how a node
   row and a session are rendered; the runtime joins these reads.
8. `packages/cli/src/runtime/list.ts`: the list this node extends.

## What this node builds

- **One resolution function** in the runner package: given `MergedRuntimes` and an optional
  requested name, return the `ResolvedRuntime` to start, or a refusal. Order: the requested
  name, then `defaultRuntime`, then the entry named `default` (the legacy block). No name
  resolvable is a refusal naming what was looked for and what exists. An unknown requested name
  refuses with a sentence that lists the known names. `run` and `plan` both call this one
  function; neither grows its own copy.
- **`--runtime <name>`** on `interlock run <graph> <node>` and `interlock plan ...`. Refusals
  print as sentences and exit non-zero before anything is leased: a bad runtime name must not
  cost a lease.
- **The runtime on the session.** `Session` gains an additive field, typed as a union with two
  arms: declared, carrying `name`, `kind` and the declared `model` (which may be undeclared for
  the legacy block, since its args are opaque; say so in the type, do not invent a label), and
  `unknown`, the reading of every session recorded before this shape. `session-started` carries
  it. `EVENT_SHAPE` advances to `event@v6`; `schemas/event@v6.json` is added beside the others;
  the upcast seam gains the step that reads a pre-v6 session as `unknown`; every fixture journal
  still replays and its verdicts are unchanged. Add one fixture that contains real `event@v5`
  lines with a `session-started` event: copy lines from this repository's own journal at
  `.interlock/ledger/journal.jsonl` (read it; never write it; the runner is its only writer).
  Update `docs/shapes.md` through `interlock schema reference` as the previous node did.
- **Narration.** When the pane opens, one narrated line names the runtime: name, kind, model
  or "model undeclared". It lands in the journal like every other narrated line.
- **Reads.** `interlock session show` prints the runtime under Context beside derivation.
  `interlock graph show` shows, per node, the runtime of the live or latest attempt, or nothing
  when there is none, or `unknown` for a pre-v6 attempt. `interlock runtime list` gains one
  column per runtime: the last attempt on it, as the node's outcome or lease state and the
  time, from the projection; "never run" when the record has none. The TUI (`interlock face`)
  may show the runtime where its shared view-model already carries the attempt; do not build a
  new frame for it.
- **Two small repairs from the previous node, in scope because you touch the same files:**
  `loadRuntimeCatalogue` rethrows any read error other than ENOENT as a stack trace; a present
  but unreadable file must refuse with a sentence naming the path and the error code. And
  `interlock runtime list`'s empty message says "local.yaml has no runtime block" when
  `local.yaml` is in fact absent; say which it is.

## Out of scope

Any vendor name or flag in code or tests. Any PATH or executable probe. Quota or failover
between runtimes. Node-level allowed runtimes in the graph. The daemon or watcher. Changing how
gates are judged or receipts are addressed. Do not edit `AGENTS.md`, the design notes, the
graph, the previous session's files, or this brief. Do not write to `.interlock/ledger/`.

## Constraints

- **Comments: none in `packages/*/src`.** The `comments` standing gate counts them.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Add no dependency.
- Biome is the formatter and linter (`pnpm lint`); keep `biome.json` untouched.
- Node pinned by `.node-version`; run everything through `mise exec --`. Run the focused test
  files while you work; run the standing gates once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End every
  message with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- No files outside this worktree except the temporary directories your tests create under their
  own scratch. No `/tmp`. No `rm -rf`. Never start or stop herdr. Never touch
  `~/.config/interlock`.

## Deliverable

1. Commits satisfying the acceptance; all gates green, run by you before handoff:
   `mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm check:comments`,
   the three node gate commands, and `mise exec -- pnpm interlock debrief validate
   0043-any-runtime run-with-runtime`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work, committed with the code.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit, `head_sha` = last code commit,
   a because on every decision, decisions a manifest of the diff, `open` carrying the shapes'
   gap log. In the debrief, quote verbatim: one `interlock session show` output that prints a
   runtime, one `graph show` line that shows one, and the `runtime list` output with its new
   column, all taken from a test fixture or a scratch journal, never from the real journal.
