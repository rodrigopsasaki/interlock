# Working in interlock

Read this before touching anything, whether you are a person or an agent. The design note at
`docs/design/0001-interlock.md` is the source of truth; this file is the part of it you must not
violate plus the conventions for working here.

## What this repository is

Interlock is a vendor-neutral harness for doing software work with agents: graphs of nodes, briefs
in, diffs and debriefs out, gates before done, a verified drilldown, and a position instead of an
event stream. It owns the structure of work. It does not own terminals (herdr does), beliefs about
code (a substrate does, by address), or any agent.

## Axioms

These break ties, in this order, when a tradeoff is genuinely open.

1. **Better is a direction, good is a threshold.** Ship the reasonably usable thing with escape
   hatches. An incomplete answer is not a wrong one.
2. **Never compress without keeping the way back.** A brief, a debrief, a receipt is a compression
   with provenance. A log line is a compression without one. Build the first kind.
3. **Position, not events.** The unit of human legibility is the current read. Events are receipts
   you pull, never the utterance.
4. **Compose, don't reinvent.** If prior art owns a layer with none of our judgment in it, use it
   behind one adapter.
5. **Dogfood, or don't build it.** If we would not use interlock for the thing it is meant for, we
   should not be developing it. Work on this repository runs through interlock the moment interlock
   can run anything.
6. **Seams before decisions.** Before code exists, decide only what cannot be retrofitted. Everything
   else is the next thing added, in whatever order the first real use demands.

## Invariants

These do not bend. When one is in the way, the design around it is wrong. Each names what breaking
it looks like, so we recognize it when it happens.

- **I1** Nothing is done without its proof, and the harness produced the proof. Broken: a node
  cleared on a gate the agent reported passing and the runner never ran.
- **I2** Nothing merges on an agent's opinion. Unattended is safe. Broken: anything an agent can say
  that causes a merge.
- **I3** The face speaks only the closed vocabulary. The unmatched becomes a gap, never a coinage.
  Broken: a word in a position that is in neither vocabulary and no gap entry beside it.
- **I4** Every claim in a drilldown is rooted or marked unrooted. Broken: a decision with no hunk,
  file read or receipt under it and no mark.
- **I5** The harness runs with the substrate address set to none. Broken: a feature that errors,
  rather than degrades, when the address is empty.
- **I6** No runtime, model or multiplexer assumption outside its adapter. Broken: a Claude flag, a
  Codex log path or a herdr socket call in any file that is not the adapter for it.
- **I7** Outward effects go through the outbox: intent persisted before dispatch, a stable identity
  per effect, doubt recorded as uncertain rather than resolved by guessing. Broken: a post that never
  happened because the process died between doing and recording, a duplicate posted without
  reconciliation, or an uncertain effect marked delivered because it probably was.
- **I8** Every compression keeps the way back. Broken: a brief mutated after its session started, a
  debrief overwritten rather than versioned, a receipt deleted.
- **I9** Values and conventions order and inform. They never gate. Broken: a node held because it
  violated a professed convention rather than because its proof failed.
- **I10** The human's authority is never gated. Broken: kill, override or merge unavailable for any
  reason other than connectivity.

## Vocabulary

Closed. Use these words and the team's professed domain terms. Nothing else. What does not map is
a `gap`, recorded with the nearest term and the difference.

| term | means |
| --- | --- |
| graph | The directed acyclic graph of nodes produced from one ask. Named by the ask, never by the type. |
| node | One unit of work with an acceptance, dependency edges and at most one live session. The unit of recovery, drilldown and gating. |
| brief | What a session is given: node, acceptance, gates, context slice, role. Immutable once the session starts. Role is supplied, never self-declared. |
| note | A typed entry a session appends while it works: a choice with its because, or a surprise with expected and observed. A receipt. |
| debrief | What a session returns beside its diff: discoveries and decisions, typed. Closes the notes. Versioned, verified, never overwritten. A session that ends without one is interrupted; nothing is drafted for it unless a person asks. |
| discovery | Something the agent had to find that the brief did not give it. Every discovery is a brief deficiency. |
| decision | A choice the session made, pointing at what it rests on and the hunk it produced. Rooted or marked unrooted. |
| gate | A check the runner executes in the worktree. Declared in the brief or the standing table. Its result is a receipt. In one of five states: pending, satisfied, blocked, waived, superseded. A worker may challenge a gate; only a person or a ratified policy waives one, with a because. |
| receipt | A fact the harness observed. Content-addressed by SHA and gate. Carries its spend (none, metered, local) and its derivation. Empty is not absent. |
| spend | What a receipt cost: none, metered, or local. Decides revival: a receipt that cost nothing is re-earned; one that cost inference or money is kept and never re-spent. |
| derivation | Who produced a receipt or a mark: gate kind and version and runner, or model, prompt id and lens, or the person. Required, never optional. |
| mark | What the verifier attaches to a debrief claim: rooted, unrooted, unexplained, gap. Never a verdict. |
| outcome | How a node ended: cleared, held, reset, failed, cancelled, superseded. Always with its receipts. Failure, disposition and because are recorded separately. |
| lease | A runner's claim on a node with a typed expiry, renewed by heartbeat. Bounds silence, not work. Expiry is liveness; a sweeper, never the dead worker, writes the terminal fact. |
| runner | The daemon that claims nodes, drives herdr, runs gates, verifies debriefs. Plain code. |
| session | One agent process working one node in one pane. Ephemeral. |
| position | The current read of a graph, composed above the stream. The only thing the face volunteers. |
| critical path | The chain of nodes that decides when the graph finishes. |
| float | How long a node can wait without moving the graph's finish. |
| stale | A node whose upstream outcome changed after it ran. Stale nodes re-run. |
| cleared | A gate passed; a node whose proof the runner holds. |
| held | A node waiting at a signal: a fork that is yours, or a failed gate, with an expiry. Siblings proceed. |
| mandate | A pre-ratified grant to act: who granted it, which action kind, in which context, until when, why. Never blanket. |
| gap | An ask or debrief phrase that maps to no term. Telemetry, not belief. |

## Seams, and the first thing through each

| seam | first through it | added later through the same seam |
| --- | --- | --- |
| Gate kinds | command gate | shape, review, human |
| Verifier marks | deterministic hunk check | model-produced marks |
| Graph as a file | the model as producer | hand-authored and scripted graphs |
| Brief in, diff and debrief out | whichever runtime is used tomorrow, in a herdr pane | every other runtime; the post-hoc debrief |
| The face | a process in a herdr pane | the phone channel; channel choice is last |
| Substrate address | none | a substrate, by three verbs |

Two seams cannot be retrofitted and are decided: derivation is required on every receipt and mark
from the first commit, and the ledger is a Phyxius journal from day one. The retry budget belongs
to the node and is conserved; nothing inside a node mints its own retries.

## The wall

- This repository is Rodrigo Sasaki's own work. It carries no employer's name, vocabulary, data or
  assumptions. The first company to adopt it is "the first company adopter" here, nothing more.
- The substrate is named generically. The reference implementation of the address is Preston; it is
  named in the design note once and nowhere else. Nothing is imported from it.
- Agent runtimes, models and editors are named only as examples and only inside their adapters.

## Conventions

- TypeScript, strict. Node pinned in `.node-version`, pnpm as the package manager. Vitest for tests.
- Types are contracts. Make invalid states unrepresentable. No `as`, no `!`, no `as unknown as`.
  Narrow it or write a real adapter.
- Phyxius is first-class: journal, clock, typed handlers, effect, canonical logs. Where it reads worse
  than plain code, that is a finding about Phyxius, not a reason to bend interlock.
- Conventional Commits. The subject states the why; the body justifies the choice and its tradeoffs.
- Every bend of the design gets a row in the bend log in the design note: what bent, against which
  decision or invariant, why, whether the way back was kept, what we learned.
- No `README`, docs or comments that explain what the code plainly says. Docs explain why.
