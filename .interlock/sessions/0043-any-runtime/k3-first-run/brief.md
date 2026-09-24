---
interlock: brief@v1
graph: 0043-any-runtime
node: k3-first-run
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
  - id: witnessed
    kind: human
scope:
  - runtimes.example.yaml
  - docs/design/0001-interlock.md
  - docs/shapes.md
substrate:
  address: none
---

# Brief · node `k3-first-run` · graph `0043-any-runtime`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0043-any-runtime`, approved by Rodrigo Sasaki on 2026-09-24. Do not edit the graph
  file.
- **node:** `k3-first-run`. **role:** worker, supplied here, not chosen by you.
- **depends on:** `example-profiles`, cleared, in your history. Read
  `.interlock/sessions/0043-any-runtime/example-profiles/debrief.yaml` first: that session ran
  on Codex and wrote the example catalogue you complete.
- **you are the proof.** This session was started with `interlock run ... --runtime k3`: kind
  `kimi`, model `kimi-code/k3`, the first time this harness has started a Kimi runtime. The
  runner recorded that on your session. Read it back with `mise exec -- pnpm interlock session
  show 0043-any-runtime k3-first-run` and quote the `runtime:` line in your debrief.
- **session start SHA:** the commit that contains this brief; `git rev-parse HEAD` before you
  change anything; record it as `session_start_sha`.
- **branch:** `graph/0043-any-runtime/k3-first-run`. **worktree:** this directory. Work only
  here.

## Acceptance (verbatim from the graph)

> Run this node with `--runtime k3`. Complete the kimi entry in `runtimes.example.yaml` from
> what this session can observe about its own runtime: the flags that made it unattended, the
> trust dialog wording, the model label. Remove the unverified mark. Add one bend-log row per
> startup or detection quirk the runner met on the way in; the runner's narration and screen
> capture are the evidence. Nothing else changes. The session record of this node, read with
> `interlock session show`, is the proof of the Kimi path, and the graph's position then shows
> three runtimes across four nodes. Preserve every historical artifact. Append typed notes. Run
> the focused test and lint before handoff. No push, no merge; the human merges.

## What to observe, and where the evidence is

- **Your own startup.** The runner narrates every step into the journal and saves the screen
  it judged at `.interlock/sessions/0043-any-runtime/k3-first-run/screen.txt` when it judges.
  While you work, `mise exec -- pnpm interlock session show 0043-any-runtime k3-first-run`
  prints the narration so far: whether a startup answer fired, how long readiness took, whether
  the opening prompt was taken on the first try. Quote those lines; do not paraphrase them.
- **Your own runtime.** Run `kimi --version` and, if it exists, `kimi provider list --json` (or
  the equivalent your CLI documents) to read the model label the CLI reports for this session
  and the effort levels it supports. Write what it prints, not what the brief assumed.
- **Trust dialog wording.** The catalogue entry expects the text "Trust this folder". If your
  startup showed a different dialog, or none, say so; the example's `startup_answers` must match
  what appeared.

## What this node changes

- **`runtimes.example.yaml`, the `k3` entry only.** Correct `args`, `model`, `startup_answers`
  and `startup_timeout_ms` to what you observed; state the Kimi Code CLI version in the
  comment; remove the two "unverified" comments. Touch no other entry.
- **Bend-log rows in `docs/design/0001-interlock.md`,** one per quirk the runner met starting
  you: a trust dialog the startup answer did or did not catch, a readiness signal herdr did or
  did not read, a lost or duplicated opening prompt, anything the narration shows that the
  design did not predict. Use the table's voice and the row dated 2026-09-24 as the model. If
  the startup was clean, write one row saying so and what made it clean.
- **`docs/shapes.md`,** regenerated with `mise exec -- pnpm interlock schema reference` if the
  example file changed; commit the result.

## Words

An entry of the catalogue is **a runtime**. Never "profile". A word that does not exist is a gap
in the debrief's `open`, with the nearest term and the difference.

## Gates

Standing gates run by the runner at judgement: `typecheck`, `lint`, `comments`, `test`,
`debrief-valid`. Node gates: `example-valid`, the schema test the previous node wrote
(`packages/schemas/test/runtimesExample.test.ts`); and `witnessed`, a human gate a person clears
after reading your session record. Not yours.

## Constraints

- No code changes; if a gate fails on something outside this node's scope, record it in the
  debrief's `open` and stop, do not work around it.
- Biome is the formatter and linter (`pnpm lint`). Node pinned by `.node-version`; run
  everything through `mise exec --`. Run the standing gates once before the debrief; if your
  sandbox cannot bind local ports and the full test suite fails for that reason alone, record
  the exact error and the gate as failed in `gates_run_by_agent`; the runner runs it again
  outside your sandbox.
- Conventional Commits, why-subjects, bodies. Commit on this branch. **Do not push.** End every
  message with `Co-Authored-By: Kimi kimi-code/k3 <noreply@moonshot.ai>`.
- No files outside this worktree. No `/tmp`. Never start or stop herdr. Never write
  `.interlock/ledger/`. Never read or write `~/.config/interlock`.

## Deliverable

1. Commits satisfying the acceptance; gates green as far as your sandbox allows, run by you
   before handoff, including `mise exec -- pnpm interlock debrief validate 0043-any-runtime
   k3-first-run`.
2. `notes.yaml` beside this brief, `notes@v0`, appended while you work, committed with the
   files.
3. `debrief.yaml` beside this brief, `debrief@v2`, final commit, derivation `kind: agent`,
   `runtime: kimi`, `model: kimi-code/k3`, a because on every decision, decisions a manifest of
   the diff, and in `open` the exact `runtime:` line `interlock session show` printed for this
   session. For a first filing you may run `mise exec -- pnpm interlock debrief prepare
   0043-any-runtime k3-first-run --to <candidate-path> --agent-runtime kimi --agent-model
   kimi-code/k3` and then `mise exec -- pnpm interlock debrief file-derived 0043-any-runtime
   k3-first-run --from <candidate-path>`.
