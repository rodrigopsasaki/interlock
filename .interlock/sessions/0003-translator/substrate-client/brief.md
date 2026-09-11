---
interlock: brief@v1
graph: 0003-translator
node: substrate-client
role: worker
gates:
  - id: typecheck
    kind: command
    run: pnpm typecheck
  - id: test
    kind: command
    run: pnpm test
  - id: debrief-valid
    kind: command
    run: pnpm interlock debrief validate {graph} {node}
  - id: context-renders
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test --testNamePattern context
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages
  - .interlock/local.example.yaml
  - .interlock/sessions/0003-translator/substrate-client
substrate:
  address: none
---

# Brief · node `substrate-client` · graph `0003-translator`

This brief is immutable once your session starts. If it is wrong, say so in the debrief; do not
edit it.

## Node

- **graph:** `0003-translator`, approved by a receipt in the repository's shared journal. Do not
  edit any graph file.
- **node:** `substrate-client`. **role:** worker, supplied here, not chosen by you.
- **depends on:** nothing in this graph. You build on `schemas/substrate/` (graph 0002), the slice
  renderer in `packages/debrief`, and the runner's brief composition and judgement.
- **how this session runs:** `interlock run` leased this node, created this worktree, committed
  this brief into it, started you in a herdr pane and will judge the gates when you stop.

## Acceptance (verbatim from the graph)

> `packages/substrate`: a client for `substrate@v1` with `context` and `absorb` required and
> capabilities discovered; the address `none` is a client that renders nothing and absorbs
> nothing while everything still runs; an `http` address speaks JSON over HTTP per
> `schemas/substrate/`. The runner calls `context` when it composes a brief and renders the
> slice into the body with the renderer that exists, and calls `absorb` at judgement, cleared
> or held. Every call is narrated on the session with the address and the verb; a refusal is
> a sentence; an absent capability degrades per capability, never fails the run.

## Context slice

No substrate is addressed. This section is empty.

## Read first

1. `AGENTS.md`: invariants I5 and I6, the vocabulary, Compatibility, Constraints, and the fence: no
   substrate is named in code, schema or test; the reference implementation appears once, in the
   design note, and nowhere you write.
2. `docs/design/0003-substrate.md` in full, at v1.0: the verbs, Payloads, D22 to D25, the mapping
   section (read, never copied). `docs/design/0001-interlock.md`: D4, D6, I5.
3. `schemas/substrate/*.json`, especially `context.request`, `context.response`,
   `absorb.request`, `absorb.response`, `capabilities.response`; `schemas/item@v1.json`;
   `packages/schemas/src` (the ajv registry you validate requests and responses with).
4. `packages/debrief/src` (the `item@v1` slice renderer and the brief body sections),
   `packages/runner/src/sessionBrief.ts` (where the brief body is composed and the context slice
   section says "No substrate is addressed"), `packages/runner/src/judgeWorktree.ts` and
   `packages/cli/src/{run,judge}.ts` (judgement, where `absorb` is called),
   `packages/runner/src/localConfig.ts` (`substrate.address` today: `none`).

## What this node builds

- **`packages/substrate`.** `substrateClientFor(address)` returns a client typed by its address:
  `none` implements `context` as an empty slice and `absorb` as an acknowledgement of nothing, and
  declares no capabilities; `http(s)://…` posts JSON to `<address>/substrate@v1/<verb>` with the
  request schema's shape, validates the response against the response schema before trusting it
  (a response that fails its schema is a refusal sentence naming the JSON pointer), and reads
  `capabilities` once per client from `<address>/substrate@v1/capabilities`. Timeouts and network
  errors are refusals; nothing throws. A verb the address does not declare degrades: the caller
  gets a typed `absent` result, never an error.
- **The runner calls it.** When `interlock run` composes a brief, it calls `context(node, scope,
  role)` and renders the slice into the body's context section with the existing renderer,
  replacing the sentence "No substrate is addressed" only when the address is not `none`. At
  judgement, `run` and `judge` call `absorb(debrief, notes, receipts)` for a `debrief@v2` session,
  cleared or held, and narrate the acknowledgement's counts (decisions absorbed, discoveries known,
  new, unplaced, gaps) on the session. Every call is one narrated line: verb, address, outcome.
- **Config.** `substrate.address` in `.interlock/local.yaml` accepts `none` or an `http(s)` URL;
  `local.example.yaml` documents both in one line each. `.interlock/config.yaml` stays untouched.
- **Tests.** A fake substrate server (an `http` listener in the test's own directory, port from
  the OS) that answers each verb with fixtures validated by the schemas; `none` renders nothing
  and every existing run test passes unchanged; a declared-absent capability degrades; a
  malformed response is refused with a sentence; the brief body carries the rendered slice when
  the address is set and the old sentence when it is not. Name the context tests so the gate finds
  them (`context`).

## Out of scope

The upward translation (`evidence` builds it; `absorb` here sends what the debrief already is);
the interpreter; any substrate implementation; `AGENTS.md`; any design note; any graph;
`.interlock/config.yaml`; this brief; other sessions' files.

## Constraints

- **Comments: none in `packages/*/src`.** Never quote `AGENTS.md`, this brief or a design note in
  code. Never name any substrate implementation anywhere you write.
- Strict TypeScript; no `as`, `!`, `any`, `as unknown as`. No new dependencies (Node's own
  `http`/`fetch` suffice). Small files named for the vocabulary.
- Node pinned by `.node-version`; run everything through `mise exec --`.
- Conventional Commits, why-subjects, bodies. Commit as you go. **Do not push.** Every message
  ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- No files outside this worktree. No `/tmp`. No `rm -rf`, `git reset --hard`, `git clean`;
  `rmSync` on a test's own directory only. Never touch herdr. Never append to the shared journal.
  Never call any real network address from a test.

## Deliverable

1. Commits satisfying the acceptance; gates green under the invocations in the front matter.
2. `notes.yaml` beside this brief (`notes@v0`), committed as you go.
3. `debrief.yaml` beside this brief in `debrief@v2` as the final commit, a because on every
   decision, decisions a manifest of every changed file.
4. In the debrief: a rendered brief body with a fixture slice, verbatim, and the narration lines
   `absorb` produces for a cleared and a held session.

When the debrief is committed, stop and wait. The runner judges from there.
