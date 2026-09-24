---
interlock: brief@v1
graph: 0043-any-runtime
node: example-profiles
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
  - id: example-valid
    kind: command
    run: pnpm --filter schemas exec vitest run test/runtimesExample.test.ts
    expect_output: Tests +[1-9][0-9]* passed
  - id: kimi-ready
    kind: human
scope:
  - runtimes.example.yaml
  - .interlock/local.example.yaml
  - docs/design/0001-interlock.md
  - docs/shapes.md
  - packages/schemas/test
substrate:
  address: none
---

# Brief · node `example-profiles` · graph `0043-any-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0043-any-runtime`, approved by Rodrigo Sasaki on 2026-09-24 (receipt
  `7ae05778c386f6f1…`). Do not edit the graph file.
- **node:** `example-profiles`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `runtime-catalogue` and `run-with-runtime`, both cleared and in your history.
  Read their debriefs under `.interlock/sessions/0043-any-runtime/` before the code.
- **you are the proof.** This session was started with `interlock run ... --runtime luna`: a
  Codex runtime, model `gpt-5.6-luna`. The runner recorded that on your session. Read it back
  with `mise exec -- pnpm interlock session show 0043-any-runtime example-profiles` and quote the
  `runtime:` line in your debrief. If it does not say luna, say so; that is a finding, not a
  failure of yours.
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0043-any-runtime/example-profiles`. **worktree:** this directory. Work only
  here.

## Acceptance (verbatim from the graph)

> Document the profiles this machine's door will use, as examples only, and prove the Codex
> path by running this node on it. This node is run with `--runtime luna`; its own session
> record, read back with `interlock session show`, is the proof of the Codex path.
>
> `runtimes.example.yaml` gains one entry per model the person pays for on this machine,
> written from facts verified in this session, never from memory: the Claude Code profiles
> (sonnet, opus, fable: kind claude, the flags today's local.example.yaml carries, the trust
> dialog answer); the Codex profiles (astra, terra, luna: kind codex, the model and
> reasoning-effort flags and the unattended approval and sandbox flags as the installed CLI
> documents them, with the CLI version they were read from); and a kimi entry (kind kimi,
> model kimi-code/k3, `--auto`, the "Trust this folder" answer) marked unverified until
> k3-first-run clears it. local.example.yaml points `default_runtime` at sonnet and says the
> catalogue is per machine. Vendor flags appear in these two example files only (I6). A
> bend-log row in docs/design/0001-interlock.md records this graph's bend: the model is chosen
> per attempt at the caller and recorded on the session, and local.yaml stops being the place a
> model is named.
>
> A test validates `runtimes.example.yaml` against `runtimes@v0`. Strict TypeScript where code
> is touched; no assertions. Preserve every historical artifact. Append typed notes. Run the
> focused test and lint before handoff. No push, no merge; the human merges.

## Words

An entry of the catalogue is **a runtime** (the graph's "profile" is not a word here; see the
two previous debriefs' `open`). Use `runtime` everywhere. If you need a word that does not
exist, record a gap in the debrief's `open`.

## Gates

Standing gates run by the runner at judgement: `typecheck`, `lint`, `comments`, `test`,
`debrief-valid`. Node gates:

- `example-valid` — `pnpm --filter schemas exec vitest run test/runtimesExample.test.ts`. Create
  exactly that file; a gate whose file is missing fails closed.
- `kimi-ready` — a human gate. Not yours. The person clears it when Kimi Code CLI is installed
  and signed in on this machine. Mention it nowhere but the debrief's `open` if it matters.

## Read first

1. `AGENTS.md`: I6 (no runtime, model or multiplexer assumption outside its adapter; example
   files are where vendor knowledge is allowed to live), Compatibility, the bend log convention
   ("Every bend of the design gets a row in the bend log in the design note").
2. `.interlock/sessions/0043-any-runtime/runtime-catalogue/debrief.yaml` and
   `run-with-runtime/debrief.yaml`: what exists (`runtimes@v0`, `mergeRuntimes`, `selectRuntime`,
   `Session.runtime`, `interlock runtime list`).
3. `runtimes.example.yaml` at the repository root: the placeholder template you extend. Keep
   its head comment; keep the placeholder entries `fast` and `careful` if you like or replace
   them, your call, but every entry you add must be a real, named runtime.
4. `.interlock/local.example.yaml`: the Claude Code flags this repository has used since day
   one (`--dangerously-skip-permissions`, `--model sonnet`, `--strict-mcp-config`) and the trust
   dialog answer (`matches: "one you trust"`, keys Down then Enter). Add `default_runtime: sonnet`
   beside the existing commented example and say, in the same voice, that the catalogue is per
   machine and lives outside the repository.
5. `packages/schemas/test/runtimes.test.ts` and `packages/schemas/src/reference/corpus.ts`:
   how the example file is already validated and rendered. Your new test validates
   `runtimes.example.yaml` against `runtimes@v0` through the schemas registry, the way the
   corpus tests do, and fails on any entry missing `kind` or `model`.
6. `docs/design/0001-interlock.md`, section "Bend log": the table columns (date, what bent,
   against, why, way back kept?, learned) and the voice of the rows dated 2026-09-1x.

## What this node builds

- **The Codex entries, verified here.** You are running inside Codex. Run `codex --version` and
  `codex --help` in this worktree and write the flags from what they print, not from memory.
  The runtimes are `astra` (model `gpt-6-astra`), `terra` (`gpt-5.6-terra`) and `luna`
  (`gpt-5.6-luna`), kind `codex`. The flags this repository's earlier Codex sessions were
  started with, for you to verify against `--help` and keep or correct: `--model <model>`,
  `-c model_reasoning_effort="<level>"`, `--disable multi_agent`, `--enable code_mode_host`,
  `--disable apps`, `--disable computer_use`, `--disable browser_use`, `--sandbox
  workspace-write`, `--ask-for-approval never`, `--add-dir <git common dir>`, with
  `startup_timeout_ms: 90000`. Say in a comment why `--add-dir` is needed: a node worktree's
  `.git` is a file pointing at the repository's common git directory outside the worktree, and
  a workspace-write sandbox must be allowed to write there for commits to land. Use a
  placeholder for the path, never this machine's. Record the CLI version in a comment.
- **The Claude Code entries.** `sonnet`, `opus`, `fable`, kind `claude`, models
  `claude-sonnet-5`, `claude-opus-5-5`, `claude-fable-5-1`, the flags from local.example.yaml
  with the model name swapped, the trust dialog answer. Verify the flags exist with
  `claude --help` if the executable is present in this sandbox; if it is not, say so in a note
  and write them from local.example.yaml, which is this repository's own verified record.
- **The Kimi entry.** `k3`, kind `kimi`, model `kimi-code/k3`, args `["--auto"]`,
  `startup_answers` matching `"Trust this folder"` with keys `["Enter"]`, `startup_timeout_ms:
  90000`, and a comment on the entry: unverified until `k3-first-run` clears; the facts come
  from Kimi Code CLI 2.1.1's documented behaviour, read on 2026-09-24, not from a run.
- **The bend-log row**, dated 2026-09-24, in the table's voice: what bent (local.yaml's
  `runtime:` block was where a model was named, once per repository; a per-machine catalogue
  and a per-attempt `--runtime` replace it, and the session records the choice), against
  (the local shape, D-numbers you find relevant, the "strategy is declared, model is measured"
  section), why (the door wants to say which model runs which node, and the record must say
  which did), way back kept (the `runtime:` block still reads as the runtime named `default`;
  pre-v6 sessions read as `unknown`, never invented), learned (one sentence you can defend
  from the two debriefs you read).
- **Regenerate `docs/shapes.md`** with `mise exec -- pnpm interlock schema reference` if the
  example file is one of its sources, as the previous nodes did, and commit the result.

## Out of scope

Any code under `packages/*/src` unless a test needs a one-line export. The real catalogue at
`~/.config/interlock` (never read it, never write it; you cannot see it from this sandbox and
must not try). The runner, the ledger, the face. Kimi's actual verification (that is the next
node). Any push or merge.

## Constraints

- No comments in `packages/*/src`. Comments in YAML example files are welcome where they carry
  a why.
- Biome is the formatter and linter (`pnpm lint`). Node pinned by `.node-version`; run
  everything through `mise exec --`. Run the focused test while you work; run the standing
  gates once before the debrief.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End every
  message with `Co-Authored-By: Codex gpt-5.6-luna <noreply@openai.com>`.
- No files outside this worktree except the temporary directories a test creates under its own
  package's `test/.runs/`; `rm -rf` is allowed on those directories only. No `/tmp`. Never start
  or stop herdr. Never write `.interlock/ledger/`.

## Deliverable

1. Commits satisfying the acceptance; all gates green, run by you before handoff:
   `mise exec -- pnpm typecheck && mise exec -- pnpm lint && mise exec -- pnpm check:comments`,
   the `example-valid` gate command, and `mise exec -- pnpm interlock debrief validate
   0043-any-runtime example-profiles`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work, committed with the
   files.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit, `head_sha` = last commit,
   derivation `kind: agent`, `runtime: codex`, `model: gpt-5.6-luna`, a because on every
   decision, decisions a manifest of the diff, and in `open` the exact `runtime:` line
   `interlock session show` printed for this session, quoted verbatim.
