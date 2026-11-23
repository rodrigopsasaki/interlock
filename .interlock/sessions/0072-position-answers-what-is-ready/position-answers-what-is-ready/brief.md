---
interlock: brief@v1
graph: 0072-position-answers-what-is-ready
node: position-answers-what-is-ready
role: implementer
gates:
  - id: position-ready-tests-pass
    kind: command
    run: pnpm --fail-if-no-match --filter cli exec vitest run test/positionReady.test.ts --passWithNoTests=false
    expect_output: 'Tests +([1-9][0-9]+) passed'
  - id: typescript-compiles
    kind: command
    run: pnpm typecheck
scope:
  - packages/cli/src/position.ts
  - packages/cli/src/main.ts
  - schemas/ready@v0.json
  - packages/schemas/src/registry.ts
  - packages/cli/test/positionReady.test.ts
substrate:
  address: none
walk:
  kind: none
  because: the substrate address is none, so there is nothing to ask
---

# Brief · node `position-answers-what-is-ready` · graph `0072-position-answers-what-is-ready`

## Acceptance (verbatim from the graph)

> `interlock position --ready` (with or without `--json`; `--repo` as today) reads the same graphs and decides
> readiness exactly as the full read does (same function, no second definition of ready), then emits only the
> ready nodes of approved graphs: a node of a graph that is not approved is never listed, whatever its state
> (on 2026-11-16 the full read showed unapproved 0080's node as "ready"). With `--json` the output is one compact line in a new shape `ready@v0`:
> { "interlock": "ready@v0", "repositories": [ { "root": <path>, "origin"?: { "owner", "name" } (when the full
> read identifies it), "state": "read" | "not-found", "because"?: <text>, "ready": [ { "graph": <id>, "node": <id>, "criticalPathIndex": <n or -1>,
> "nodeIndex": <n> } ] } ] }, with ready in launch order: graph order as the full
> read lists graphs, then
> critical-path index (absent last), then node index. A graph that cannot be read is skipped and named under its
> repository as "unreadable": [ { "graph", "because" } ], never treated as having ready nodes. Add schemas/ready@v0.json beside
> schemas/positions@v2.json so `interlock schema validate` accepts it. Without `--ready` every output
> byte is unchanged.
> Named cases in packages/cli/test/positionReady.test.ts: "a ready node in a fixture graph is listed with its
> graph and node"; "a node that is running, held, cleared or blocked is not listed"; "a ready node of an unapproved graph is not
> listed"; "the repository's origin owner and name are carried when identified"; "launch order is graph order,
> then critical path, then node index"; "an unreadable graph is named, never listed as ready"; "two repositories are answered in the order asked"; "the read does not grow with attempts: a node with 200 recorded attempts adds
> nothing to the output beyond its one ready entry"; "the output validates as ready@v0"; "without --ready the
> output is byte-identical to today's full read on the same fixture".
> Touches only: packages/cli/src/position.ts, packages/cli/src/main.ts (only if the flag must be wired there),
> schemas/ready@v0.json (new), packages/schemas/src/registry.ts only if shapes are listed there, the new test file.
> Tests build fixture repositories; they never read his real checkouts or HOME.

## How

Implement the bounded ready projection in `packages/cli/src/position.ts` from the existing full position read and its `positionOf` readiness state. Keep one readiness definition: list only nodes whose full-read state is `ready` and whose graph approval is `approved`. Preserve the asked repository order, each repository's root and identified origin owner and name, and the full read's graph order. Put graphs that cannot be read under `unreadable` with their graph and reason, never in `ready`.

For the JSON ready read, emit the compact `ready@v0` object with each ready graph, node, critical-path index or `-1`, and node index, ordered by graph order, then critical path with absent entries last, then node index. Keep the output bounded by ready entries rather than attempts history. Preserve every output byte of the existing full read when `--ready` is absent, and keep `--repo` behavior and the order of asked repositories unchanged.

Add the new schema beside `schemas/positions@v2.json` and make the registry change only if the existing shape listing requires it. Add the named `packages/cli/test/positionReady.test.ts` fixture cases from the acceptance; the tests use fixture repositories and do not read real checkouts or `HOME`. Wire `--ready` in `packages/cli/src/main.ts` only if the existing command forwarding requires it.

<!-- interlock: debrief-authoring-guidance@v1:start -->
## Debrief authoring

`found_at`, `rests_on`, and `hunks` say what supports a claim. Optional `applies_to` says
where you judge a rooted lesson useful; it never supplies support or ratifies a claim.

Review notes for discoveries worth handing on. For an explicit `found_at` path and line or
range, write one separate exact quotation from that range at the authored head. A bare ranged
path does not establish the discovery:

```yaml
discoveries:
  - id: exact-range
    what: The evidence records a durable exact excerpt.
    found_at: 'evidence.ts:2-3 "durable exact excerpt"'
    mattered_because: A later session can re-read the cited source.
```

No discovery, no justified applicability, an unrooted claim, and declining a received hypothesis
are all valid. Do not invent claims, infer applicability, rewrite citations, or promote notes
automatically.

Prefer a justified narrow path:

```yaml
applies_to: { kind: path, path: packages/substrate/src/evidence.ts }
```

Use repository scope only with an explicit cross-cutting reason:

```yaml
applies_to: { kind: repository }
```

Omit `applies_to` when no target is warranted. Keep the real decision and its why, and say what
a future session can act on. It changes neither authority nor gates, and does not establish better
judgment. Treat received context as a hypothesis: check, reject, or leave it unused.

Before filing, optionally inspect an authored candidate read-only with `interlock debrief preview --file <candidate>`.

Before you stop to wait for a person in your pane, append a question note to notes.yaml, then
ask in the pane as you do today. `asked` is the question in the words you would say to the
person; optional `options` are the short answers you would accept. The position shows exactly
these words while you wait, and nothing else:

```yaml
  - kind: question
    at: "2026-11-05T01:30:00Z"
    asked: Should the walk stay empty when the substrate address is none?
    options: [yes, no]
```
<!-- interlock: debrief-authoring-guidance@v1:end -->

<!-- interlock: role-walk@v0:start -->
## Walk

Role: implementer.

This walk is empty: the substrate address is none, so there is nothing to ask. Nothing here errors; the session runs without a substrate.
When an address is set, the whole substrate is open to the session through it, and any role may walk anywhere it wants.
<!-- interlock: role-walk@v0:end -->
