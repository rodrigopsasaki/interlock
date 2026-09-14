---
interlock: brief@v1
graph: 0004-readable-refusals
node: honest-http-refusals
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
  - id: http-refusal-regressions
    kind: command
    run: pnpm --filter substrate --fail-if-no-match test context.test.ts absorb.test.ts
    expect_output: Tests +[1-9][0-9]* passed
scope:
  - packages/substrate/src/httpClient.ts
  - packages/substrate/test/context.test.ts
  - packages/substrate/test/absorb.test.ts
  - packages/substrate/test/support/fakeSubstrateServer.ts
substrate:
  address: none
---

# Brief · readable HTTP refusals

## Acceptance

> A non-2xx response received for context or absorb remains a refused outcome
> naming its verb and exact HTTP status, with a useful bounded body explanation
> when available. Recognize a JSON error.message string, a JSON error string,
> or plain text; do not serialize arbitrary JSON objects as an explanation.
> Limit error-body consumption to 1024 bytes and displayed detail to 512
> characters, normalize control characters, and indicate truncation. Empty,
> unreadable, unrecognized, or malformed structured bodies still retain the
> received status, never becoming a claim that no response arrived. Never
> copy headers into the explanation, and redact the configured bearer token
> if the server echoes it. Successful responses and address-none behavior
> remain unchanged. Network and abort failures remain distinguishable from
> received HTTP failures. Tests use only a local fake server and prove both
> verbs, the supported body forms, empty and malformed bodies, truncation,
> echoed-token redaction, and existing success/network behavior. A targeted
> regression fails against the old client. The session commits its notes and
> versioned debrief with references to its changed files; the harness, not the
> worker, executes the declared and standing gates.

## Read first

1. `AGENTS.md`, especially I1, I5, I7, I8, and the strict TypeScript and no-comments conventions. The refusal is a narration of what the harness received; it must not invent a lost connection or disclose an effect's credentials.
2. `packages/substrate/src/httpClient.ts`. `call` currently returns on non-2xx before reading the response body; keep the successful-response and transport paths separate.
3. `packages/substrate/test/context.test.ts`, `packages/substrate/test/absorb.test.ts`, and `packages/substrate/test/support/fakeSubstrateServer.ts`. These are the local HTTP seam for both verbs. Extend the fake only as needed to express declared media and raw bounded bodies.
4. `packages/substrate/src/narrate.ts` and `packages/substrate/src/client.ts`. Preserve the existing refused outcome and its context/absorb narration contract; do not add a second outcome kind.

## Intended touch scope

The expected code and tests are the four scoped paths in the front matter. A small helper under `packages/substrate/src/` is permitted only if it keeps response-detail handling out of the client flow and remains covered by the targeted tests. Do not change schemas, protocol versions, runner waits, graph files, local configuration, capabilities, evidence translation, or the face. Do not call a live address or any external API.

## Detail boundary

The 1024-byte intake limit and 512-character rendered-detail limit are distinct: collect no more than the byte limit from a received non-2xx body, then render no more than the character limit after selecting and normalizing its supported explanation. Mark either kind of truncation truthfully. A body-reader error or reader cancellation after the HTTP response exists retains that response's verb and exact status, with no body detail if none was safely read.

Use declared media distinctions: JSON media may yield only `error.message` or `error` when each is a string; plain-text media may yield its text; empty, malformed, unknown-media, or JSON-object bodies yield status without arbitrary object serialization. Remove terminal control characters before rendering. Never inspect, copy, or narrate headers.

If a configured bearer token appears in eligible detail, redact that exact configured value before it can be rendered. Preserve enough matching state across chunks and the collection boundary that an intake or display cut through a prefix of that same configured value cannot emit the prefix; omit that trailing prefix rather than guessing at any other secret. Do not claim to recognize or redact unconfigured secrets.

## Working record and proof

Before authoring records, read `schemas/debrief@v2.json`, its referenced part schemas, and `schemas/notes@v0.json`. Validate with `mise exec -- pnpm interlock debrief validate 0004-readable-refusals honest-http-refusals` before the final record commit. Do not launch another agent, switch models, or alter your brief; the orchestrator owns delegation. The runner's brief commit is harness-authored, not your implementation.

This session is the only writable harness record: append `notes@v0` choices or surprises incrementally under `.interlock/sessions/0004-readable-refusals/honest-http-refusals/`; do not alter another session's records. Finish with a committed `debrief@v2`, not a drafted or overwritten debrief. Its derivation must name the actual runtime and model that performed this work, not the graph producer or an earlier author. Each decision cites every changed file it rests on; its graph-base SHA comes from runner front matter, its session-start SHA is HEAD before work, and its head SHA is the last code commit rather than the debrief's own commit.

Run any local checks through `mise exec -- pnpm ...` if useful, but agent-reported results are not proof. The harness runs the declared and standing gates. Commit messages state why with a body explaining the boundary and tradeoff. Do not push, merge, waive, alter approval, edit this graph or configuration, clean worktrees, or use `/tmp`; use an ignored directory local to the worktree for scratch work. Make the smallest implementation that meets the acceptance. If the scoped seam cannot express it or the acceptance conflicts with the graph, record the surprise and return a held position for the person.
