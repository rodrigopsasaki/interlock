# Brief · node `debrief-schema` · graph `0001-bootstrap`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0001-bootstrap`, **approved** against content sha256 `d650e7738535cd36…`. Do not
  edit the graph file.
- **node:** `debrief-schema`
- **role:** worker. Supplied here, not chosen by you.
- **depends on:** `ledger`. The ledger is **held**, not cleared, on exactly one gate:
  `debrief-valid`, the standing gate whose validator is the stub this node replaces. Running this
  node before its dependency clears is a recorded bootstrap exception, made once by the harness,
  because this node is what gives that gate its mechanism. Every other dependency rule holds.
- **graph base SHA:** `a22166b9695e695e8f846934088c71d3ea4d6578`
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0001-bootstrap/debrief-schema`. **worktree:** this directory. Work only here.

## Acceptance (verbatim from the graph)

> The debrief file format and its validator, and the note format it closes: a choice carries
> its because, a surprise carries expected and observed. The brief tells the agent where to
> write them and what shape they have. A missing or invalid debrief trips the standing gate and
> holds the node as interrupted. A drafted debrief is distinguishable from an authored one and
> is only ever produced when a person asks.

## Gates

Standing gates (note the placeholders, new in `.interlock/config.yaml` as of this brief):

- `typecheck` — `pnpm typecheck`
- `test` — `pnpm test`
- `debrief-valid` — `pnpm interlock debrief validate {graph} {node}`. After this node, this gate
  runs for real. For this session it validates your own `debrief.yaml` and `notes.yaml`.

## Read first

1. `AGENTS.md`: vocabulary, Compatibility (readers accept every prior version forever; a new
   required field or rename is a new version with a reader for the old one; a wrong file gets a
   sentence), the plans-and-approval convention.
2. `docs/design/0001-interlock.md`: The verifier (notes during, debrief after; interrupted; the
   post-hoc debrief only on request), Compatibility, D6, D12, D21, the bend-log rows dated
   2026-09-09 and 2026-09-10.
3. `docs/design/0002-face.md`: the Views table rows for Session and Decision → hunk.
4. `packages/ledger/src/debrief.ts`: the `Debrief`, `Decision`, `Discovery`, `GateRun`,
   `DebriefDerivation` types and guards. That type is the specification of `debrief@v2`; this
   node writes the file shape that maps onto it and the reader that produces it.
5. `packages/ledger/src/note.ts` (the `Note` type: choice with because, surprise with expected
   and observed), `envelope.ts`, `event.ts` (`debrief-filed`, `note-appended`).
6. `packages/runner/src/gateCommand.ts`, `gateJudge.ts`, `standingGates.ts`, and
   `packages/cli/src/run.ts` and `backfill.ts`: how gates are executed and how a node is judged;
   you add placeholder substitution and, after a successful judgement, debrief ingestion.
7. `packages/cli/src/debrief/validate.ts` and `main.ts`: the stub you replace and the dispatch.
8. `packages/face/src/document.ts` and `validate.ts`: the graph loader's style for YAML parsing
   with sentence errors; mirror it.
9. **The corpus on disk.** Every session directory under `.interlock/sessions/0001-bootstrap/`:
   `scaffold/debrief.yaml` is `debrief@v0`; `ledger`, `face-read`, `ledger-gaps` and
   `runner-command-gate` are `debrief@v1`; their `notes.yaml` files are `notes@v0`. These are
   real files written by real sessions and they are your fixtures. All of them must validate.

## What this node builds

- **The `debrief@v2` file shape**, as YAML, mapping one to one onto the ledger's `Debrief` type:
  `interlock: debrief@v2`, `graph`, `node`, `role`, `graph_base_sha`, `session_start_sha`,
  `head_sha`, `derivation` (`kind: agent` with `runtime` and `model`, or `kind: human` with
  `who`), `discoveries[]` (`id`, `what`, `found_at`, `mattered_because`), `decisions[]` (`id`,
  `what`, `because` **mandatory**, `rests_on[]`, `hunks[]`, optional `produces[]`, optional
  `rejected`), `gates_run_by_agent[]` (`id`, `result`, optional `invocation`, `note`), `open[]`.
  One optional, additive field distinguishes a drafted debrief from an authored one:
  `drafted: { by: <who or model>, from: <sha the draft was read from> }`; its presence means
  drafted. Nothing in this node produces a draft; the field exists so a future command can, and
  only when a person asks.
- **Readers for every version.** `debrief@v0` (scaffold's: `base_sha`, no role, no because) and
  `debrief@v1` (no because, `base_sha` renamed) validate as legacy-valid: the gate passes, and
  the reader reports which fields the newer shape would have required. They do not produce a
  `Debrief` value, because a decision without a because cannot honestly be given one. `debrief@v2`
  validates and produces a `Debrief`. Writers write v2. Say this in the CLI's own words when a
  legacy file passes: valid as `debrief@v1`; not ingested.
- **`notes@v0` reader.** Every entry is a choice with `chose` and a mandatory `because`, or a
  surprise with `expected` and `observed`; anything else is a sentence naming the entry index and
  what is missing.
- **`interlock debrief validate <graph> <node>`.** Finds `.interlock/sessions/<graph>/<node>/`
  in the repository root (the current worktree), validates `debrief.yaml` and `notes.yaml`, exits
  zero when both are valid at any known version, non-zero with sentences otherwise. A missing
  debrief is the sentence "no debrief was filed for <graph>/<node>; the session is interrupted".
  Called with no arguments it refuses with a sentence naming the form. Optionally `--file <path>`
  validates one file for hand use.
- **Placeholders in gate commands.** The runner substitutes `{graph}` and `{node}` in every gate
  command it runs; an unknown placeholder is a sentence. `.interlock/config.yaml` already uses
  them for `debrief-valid` (edited by the harness in the same commit as this brief).
- **Ingestion.** When the runner judges a node and its gates pass, and the debrief file is
  `debrief@v2`, the runner appends `debrief-filed` with the parsed `Debrief` and `note-appended`
  for each note, through the ledger's own append, before the outcome. For a legacy-valid file it
  appends nothing and the position says so. The face's session views then have data for v2
  sessions.
- **Errors are sentences** with file and, where the YAML parser gives one, line: unknown shape
  tag, missing field, decision without because, note without its required fields, `head_sha`
  not a SHA.
- **Vocabulary.** debrief, note, choice, surprise, discovery, decision, because, derivation,
  gate, held, interrupted (the state a session is in when it ends without a debrief; it is not a
  new outcome kind, it is held on the `debrief-valid` gate with that failure recorded). `drafted`
  is the one new field; it is not a new noun.

## Out of scope

Producing a draft (no model is called anywhere in this node); the inverse check of decisions
against the diff (that is `verifier-hunks`); the face's session views; the substrate. Do not
edit `AGENTS.md`, either design note, the graph, or this brief. `.interlock/config.yaml` is
already edited for you; do not change it further.

## Constraints

- **Comments: as few as possible. This is a public face.** Names, types, tests and module
  boundaries carry the meaning; a comment exists only where the code cannot say it. Never quote
  AGENTS.md, the brief or a design note inside code.
- Small single-purpose files named for the vocabulary. Strict TypeScript; no `as`, `!`, `any`,
  `as unknown as`. Reuse the `yaml` dependency already present; verify any new dependency on npm.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** Every
  message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`. Never start or stop herdr.

## Deliverable

1. Commits satisfying the acceptance; all standing gates green, including `debrief-valid` run
   for real against this session's own files: `mise exec -- pnpm interlock debrief validate
   0001-bootstrap debrief-schema`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work, committed with the code.
3. `debrief.yaml` beside this brief, in the **new `debrief@v2` shape you define**, final commit,
   `head_sha` = last code commit, a because on every decision, decisions a manifest of the diff
   (every changed file in some decision's `hunks` or `produces`, `notes.yaml` and `debrief.yaml`
   included).
4. In the debrief: the validator's output for all six session directories (the five prior ones
   and yours), verbatim; and the exact sentence a missing debrief produces.
