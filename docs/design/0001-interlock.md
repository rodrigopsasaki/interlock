# Interlock

Design note · v0.7 · 2026-09-09

A harness for doing software work with agents: enough context that they decide and manage their
own work, enough structure that you never lose control. Named for the railway interlocking: the mechanism that makes an unsafe signal impossible
to set. This note is the thing we weigh against when it bends.

| | |
| --- | --- |
| Status | Decided. Two nodes of the bootstrap graph cleared; the rest not built. TypeScript on Node. |
| Owner | Rodrigo Sasaki, own repository, Apache 2.0. The first company adopter arrives by config and an address only. |
| Composes | herdr for processes. A substrate for beliefs about code. Interlock for the structure of work. |
| How to read | Decisions are D-numbered, invariants I-numbered. The bend log cites them. A decision may bend with a written entry. An invariant bending means the design is wrong, not the invariant. |

## What we are pushing it for

Three outcomes, in order of weight.

**Control without watching.** You hold a position and are told when it should change. You do
not watch. Everything you delegate to is judgment you already did, held in structure that every
agent reads.

**Giveable to a multitude.** Anyone keeps their own agent, editor and model. What they adopt is a
practice with a reference implementation, and an exit that costs them a habit, not their work.

**Compounding.** Every session leaves a typed trace. What the agent had to discover is what the
briefs failed to say. Read in aggregate, that is the organisation's judgment accreting.

### How we weigh

When a tradeoff is genuinely open, these break the tie, in this order.

1. **Better is a direction, good is a threshold.** Ship the reasonably usable thing with escape
   hatches. An incomplete answer is not a wrong one.
2. **Never compress without keeping the way back.** A brief, a debrief, a receipt is a compression
   with provenance. A log line is a compression without one. Build the first kind.
3. **Position, not events.** The unit of human legibility is the current read. Events are receipts
   you pull, never the utterance.
4. **Compose, don't reinvent.** If prior art owns a layer with no judgment of ours in it, use it
   behind one adapter.
5. **Dogfood, or don't build it.** If we would not use interlock for the thing it is meant for, we
   should not be developing it.

## The shape

```mermaid
flowchart LR
  You["You<br/>terminal · phone"]
  subgraph IL["interlock · owns the structure of work"]
    Face["Face<br/>interpreter · editor<br/>owns no state"]
    Ledger["Ledger<br/>graphs · nodes · leases<br/>receipts · outbox"]
    Runner["Runner<br/>herdr adapter<br/>tmux fallback"]
  end
  Herdr["herdr<br/>panes · agent state<br/>machines · attach"]
  Agents["Agents<br/>Claude · Codex · Cursor · human"]
  Sub["Substrate<br/>by address · may be none"]

  You -->|ask · verb| Face
  Face -->|position| You
  Face -->|graph| Ledger
  Ledger -->|reads| Face
  Ledger -->|lease + brief| Runner
  Runner -->|"diff + debrief → verify → gate → receipt"| Ledger
  Runner -->|start · prompt| Herdr
  Herdr -->|wait · read · state| Runner
  Herdr -->|owns terminals| Agents
  Ledger -->|debrief + discoveries| Sub
  Sub -->|context slice · vocabulary| Ledger
```

*Figure 1. Three owners, one loop. The face, ledger and runner are interlock. The substrate and
herdr are reached over an address and a socket, never imported. The loop that compounds is the
return from runner to ledger: what comes back from a session is verified and gated before it
becomes a receipt, and its discoveries go up to the substrate.*

### Layers and owners

| layer | owns | never does | reached by |
| --- | --- | --- | --- |
| herdr | Panes, processes, agent state (working, blocked, idle, done), machines over SSH, attach from anywhere, native session resume. | Know why an agent runs or whether its output is acceptable. | Local socket API, one adapter file behind a typed runner interface. |
| interlock | Graphs, nodes, briefs, gates, leases, receipts, debrief verification, the interpreter, the editor, the channel, the outbox, the face. | Hold a belief about code. Spawn a process itself. Import the substrate or herdr. | A pane in herdr, verbs over a chat channel, an HTTP read API. |
| substrate | Beliefs about code, conventions, disciplines, values, review judgment. | Hold a lease. Orchestrate. Know a pane exists. | Address in config. Three verbs. May be none. |

## Decisions

Each carries its cost and the condition under which we would revisit it. A decision without a
revisit condition is one we consider settled.

**D1. The harness is a protocol, not an integration.** Brief in as files in the worktree. Diff
plus debrief out as files next to it. Everything between is opaque and vendor-specific. This holds
for Codex, Claude, Cursor, and a human typing by hand.
*Cost:* the drilldown floor is thin; runtime adapters enrich it but are never required.
*Revisit:* never on principle. Richness is added in adapters.

**D2. The face owns zero state.** One voice you talk to is right. One agent whose context is the
system's memory is the trap. The face reads the position from the ledger and writes intents into
it. It is a projection over structure.
*Cost:* the face feels less clever than a stateful assistant in the first week.
*Revisit:* no. Resumability, audit and handoff all depend on this.

**D3. herdr owns processes.** Agent-state detection across twenty-one tools is a treadmill with
none of our judgment in it. herdr has a company and a community running it. Panes, SSH machines,
detach and attach are the same story.
*Cost:* a dependency on a funded company with a cloud tier coming; the socket has no
authentication, so it stays local and remote goes over SSH.
*Revisit:* if the socket API closes or core features move behind the cloud. Escape is the adapter
plus tmux, with a loss of state detection, not a rewrite.

**D4. The substrate is an address, reached by three verbs, and the address may be none.** Ask for
a context slice when composing a brief. Ask for domain vocabulary when interpreting. Hand over a
verified debrief with its discoveries when a node completes. With the address unset, the harness
runs fully and is merely dumber.
*Cost:* without a substrate, briefs carry only what you typed plus the repo, and discoveries go
nowhere.
*Revisit:* a fourth verb needs a written justification in the bend log before it exists.

**D5. Completion is a typed payload, and proof is a receipt the harness produced.** An incomplete
completion payload is inexpressible: a node whose acceptance names tests cannot be done without
them. The proof comes from the harness running the gate in the same worktree the diff came from,
never from the agent asserting it.
*Cost:* gates must be declared in a form the runner can execute.
*Revisit:* no.

**D6. The debrief is verified, not trusted.** A typed self-report is not a typed truth. Agents
paraphrase, impose structure that was not there, and omit the decision that mattered. Every
decision and discovery is checked against the diff and the workspace. What cannot be rooted is
marked unrooted and shown as such.
*Cost:* a verifier pass per node, code where possible, model where not. Unrooted never blocks
completion; the gate does that. It marks.
*Revisit:* verifier fidelity is measured on real sessions. If it over-marks, tune it. It never
becomes trusting.

**D7. Two vocabularies, and no third.** The harness vocabulary is fixed and small. The domain
vocabulary is professed per team and grows only by ratification. The face translates into these
and nothing else. What does not map is recorded as a gap with the nearest term and the difference,
and the face says so instead of coining a word.
*Cost:* expressiveness friction in the first weeks while the gap log fills.
*Revisit:* when the gap log shows the same unmatched noun recurring, ratify it into the domain
vocabulary. Never into the harness one.

**D8. Crash-only, with an outbox for anything that leaves the box.** The only recovery path is the
normal startup path: read the ledger, expire stale leases, reclaim nodes, continue. A power outage
is a slow restart. Every outward effect is persisted as intent before it is attempted, carries a
stable identity, and moves through pending, dispatching, and then delivered, uncertain, blocked or
terminally failed. A lease that expires mid-dispatch lands in uncertain and goes to reconciliation,
never back to pending. The outbox promises no lost intent and honest doubt; it does not promise
exactly once, because nothing can.
*Cost:* no mid-node resume. A node restarts from its last verified debrief. Nodes must be small
enough for that to be cheap.
*Revisit:* no. A special recovery mode appearing anywhere is the smell.

**D9. Outbound only. Positions to your phone, six verbs back, quiet hours by default.** The server
reaches out; nothing needs to reach in. The editor pushes position changes to a channel you already
read. The channel accepts status, kill, retry, approve, answer, pause. Blocked, stalled, and a
failed gate on the merge path are real time. Everything else waits for a digest.
*Cost:* latency is the poll interval; the remote surface is deliberately tiny.
*Revisit:* the verb set grows only for a use case that could not be served in a weekend, written
down first.

**D10. Own repository, own terms. An adopter gets a config repository and an address.** The first
commit's home decides whose work it is. A tool born inside a company absorbs that company's
assumptions without anyone deciding to. Born outside, the generic core is forced to stay generic
and anything company-specific goes where it belongs.
*Cost:* the terms must be explicit with any adopter before they adopt.
*Revisit:* no.

**D11. Liveness has three states, not two.** A heartbeat tells you dead or alive. It cannot see
alive but stuck. The ledger overlays herdr's working state with progress edges: a new discovery, a
new decision, diff growth. Fresh lease and quiet edges for too long means stalled, and stalled is
the state that costs afternoons.
*Cost:* progress edges must be defined per runtime adapter, with a floor of diff growth for all.
*Revisit:* thresholds are tuned by measurement on real sessions, never guessed twice.

**D12. The node is the unit of recovery, of drilldown, and of gating. Nodes are small.** Three
needs, one shape. A lost node costs one node's work. A drilldown reads one node's five columns. A
gate proves one node's acceptance. The graph's granularity is the system's granularity.
The retry budget belongs to the node and is conserved: nothing inside a node, no gate, no helper,
no child, mints its own retries. Decomposition never creates retry capacity.
*Cost:* per-node ceremony: a brief, a debrief, a gate run.
*Revisit:* if ceremony dominates, merge nodes. Never drop the gate to make a node cheaper.

**D13. An ask becomes a graph. The graph is the ledger, not a plan.** The interpreter produces a
directed acyclic graph of nodes, each with an acceptance and dependency edges, plus a walkable
reason for why the ask was read that way. We call it a graph and nothing more poetic: any
single-object metaphor smuggles linearity back in. The metaphor budget goes to behaviour words
borrowed from two older DAG practices: critical path and float from the critical path method, stale
and up-to-date from build graphs. Plans are commentary. The graph is what is true about the work.
*Cost:* the interpreter is the hardest part and is user-specific. It only gets good with the gap
log feeding it.
*Revisit:* the graph is a file; the model is one producer of it. Anyone may author one.

**D20. A plan is approved before any of it runs, and the approval is a receipt on the plan's
content.** A graph declares a human gate, `approved`. Its receipt carries the approver as its
derivation and the content hash of the graph file as its identity. No node in the graph is leased
and no session is briefed until that receipt exists for the current content; editing the graph
stales the receipt by construction, the same way editing code stales a test receipt, so a plan
cannot drift under an approval. The approval is a mandate over the whole graph: within an approved
plan the harness proceeds node by node without asking again; a new graph is a new approval. The
approval is agnostic of what produced the plan. The producer's derivation, a person, a model, a
script, is information that participates in the decision, never a condition of it.
*Cost:* the plan must exist as a file before work starts, which is the point. Records of what
happened, debriefs, receipts, bend-log rows, are never gated; only plans are.
*Revisit:* no. Face-read is its first viewer; until it exists the plan is rendered by hand and the
approval travels in the pull request.

**D21. A gate composes criteria, and a human criterion is one of them.** A gate is satisfied when
every criterion it declares is satisfied: a command exiting zero, a shape holding over the diff, a
board reaching its declared aggregation, a named person clearing it with a because. A human
thumbs-up therefore never replaces produced and validated artifacts; it sits beside them in the
same gate. Where a human criterion is required is decided by whoever declares the graph, and is
suggested rather than fixed, from three sources: declared, the axioms and professed values that
name what always needs a person, such as an effect that leaves the box, a spend, or a change to
an approved acceptance; learned, a projection over receipts showing where boards split, approvals
were later reverted or gates were later waived, proposed as a strategy change and ratified by a
person; and declared ignorance, an ask the interpreter cannot decompose into settleable criteria,
for which a human criterion is the honest gate. Values order candidates that all clear their
gates and never gate them, as I9 requires; a value that asks for speed that lasts is read as
speed that keeps its receipts and its way back.
*Cost:* a gate is a small conjunction rather than a single check, and the placement of human
criteria has to be re-read when the record says it was wrong.
*Revisit:* the three sources are the starting set. A fourth needs a written justification here.

## Invariants

These do not bend. When one is in the way, the design around it is wrong. Each names what breaking
it would look like.

- **I1. Nothing is done without its proof, and the harness produced the proof.** Broken: a node
  cleared with a gate the agent reported passing and the runner never ran.
- **I2. Nothing merges on an agent's opinion. Unattended is safe.** Broken: anything an agent can
  say that causes a merge, or a weekend where waiting could cost correctness rather than time.
- **I3. The face speaks only the closed vocabulary. The unmatched becomes a gap, never a coinage.**
  Broken: a word in a position that is in neither vocabulary and no gap entry beside it.
- **I4. Every claim in a drilldown is rooted or marked unrooted.** Broken: a decision with no hunk,
  file read or receipt under it and no mark.
- **I5. The harness runs with the substrate address set to none.** Broken: a feature that errors,
  rather than degrades, when the address is empty.
- **I6. No runtime, model or multiplexer assumption outside its adapter.** Broken: a Claude flag, a
  Codex log path or a herdr socket call in any file that is not the adapter for it.
- **I7. Outward effects go through the outbox: intent persisted before dispatch, a stable identity per
  effect, doubt recorded as uncertain rather than resolved by guessing.** Broken: a post that never
  happened because the process died between doing and recording, a duplicate posted without
  reconciliation, or an uncertain effect marked delivered because it probably was.
- **I8. Every compression keeps the way back.** Broken: a brief mutated after the session started, a
  debrief overwritten rather than versioned, a receipt deleted.
- **I9. Values and conventions order and inform. They never gate.** Broken: a node held because it
  violated a professed convention rather than because its proof failed. People route around this
  within a week.
- **I10. The human's authority is never gated.** Broken: kill, override or merge unavailable for any
  reason other than connectivity. Accountability is a recorded reason, not a restriction.

## Vocabulary

The harness vocabulary is closed and lives in `AGENTS.md`, which is the copy that binds. The face
may use those words and the team's professed domain terms, and nothing else.

## The session drilldown

Five columns per session, in this order. The order is the argument: what was given, what was
there, what had to be found, what was chosen, what happened.

| column | holds | why it is there |
| --- | --- | --- |
| Brief | The node, acceptance, gates, context slice, and the session's role. Immutable. The role is supplied by the brief, never self-declared, so a worker cannot hide gates from itself by deciding what it is. | You can see exactly what the agent was told. Nothing softened. |
| Context | Head SHA, files in scope, declared gates, runtime and model used. | Reproducibility. The same brief on a different SHA is a different session. |
| Discoveries | Files read outside scope, conventions inferred, questions the agent answered for itself. | The column that pays for everything. In aggregate it is the list of what your briefs keep failing to say. |
| Decisions | Each choice, what it rests on, the hunk it produced, rooted or unrooted. | Control without watching. You read choices, not transcripts. |
| Outcome | Diff, gate receipts, debrief verification status, how the node ended. | The only column that decides anything. The other four explain it. |

Raw drilldown, the actual pane, is herdr's attach and is one key away from any row. It is not
typed and we do not try to type it.

## Node lifecycle

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> leased: runner claims
  leased --> running: brief in
  running --> debriefed: diff + debrief
  debriefed --> verified: rooted / marked
  verified --> gated: runner runs gates
  gated --> cleared: proof held
  cleared --> [*]
  running --> blocked: herdr says needs you
  running --> stalled: fresh lease, quiet edges
  running --> dead: lease expired
  dead --> queued: reset to checkpoint
  gated --> held: proof failed
  held --> running: retry, or fork answered
  blocked --> running: answered
  queued --> cancelled: authorized, with because
  held --> cancelled: authorized, with because
  queued --> superseded: acceptance re-versioned
  held --> superseded: acceptance re-versioned
  cancelled --> [*]
  superseded --> [*]
```

*Figure 2. The node is the unit. Running has three ways down: blocked comes from herdr's own
detection, stalled is our overlay of quiet progress edges on a fresh lease, dead is an expired
lease and resets to the last checkpoint. Cancelled and superseded are terminal and need an
authority and a because; superseding a node never rewrites the history of its sessions. Only the
gate decides cleared. Nothing else can.*

| state | detected by | triggers |
| --- | --- | --- |
| progressing | Fresh lease and a recent progress edge: a note, a decision or diff growth. | Nothing. This is the state you do not hear about. |
| blocked | herdr's agent state, from hooks or screen manifest. | Real-time push. The fork is yours or a mandate covers it. |
| stalled | Fresh lease, no progress edge past the threshold. | Real-time push. Verbs: kill, retry, attach. |
| dead | Lease expired, noticed by a sweeper. A dead process runs no code, so the terminal fact is always written by an observer, never by the worker that died. | Receipt. Reset to checkpoint, requeue. You read it Monday if you care to. |

The lease bounds silence, not work. It is short, renewed by a heartbeat at a fraction of its
length, and deliberately decoupled from how long a node takes, so a wedged session ages out even
when its step would legitimately have run for an hour.

## Gates

A gate is a typed receipt producer. Everything below follows from that sentence.

| kind | what it is |
| --- | --- |
| Command | Run a command in the worktree, exit zero. Typecheck, tests, lint, build. Deterministic, runtime-neutral, the floor. First through the seam. |
| Shape | Deterministic checks on the diff itself: files stay in scope, a schema change carries a migration, source under a path carries a test delta, no new dependency without a decision citing it. |
| Review | A typed judgment verdict. A substrate's review is one producer; a second agent or a person is another. The verdict is the receipt, and its derivation names the lens. |
| Human | Held until a person clears it, from the face or the phone. The clearance is the receipt, with the person's name as its derivation. |

**Three sources, add but never remove.** The node's acceptance declares gates. The repository
declares standing gates in `.interlock/config.yaml`, the literal interlocking table: every node
touching this repository runs these. The graph declares merge-path gates, the ones between cleared
and merged. A node can add to its table and never subtract from it. This is how "no feature
without its tests" gets teeth without a judgment per node: the standing table says it once.

**A gate is in one of five states.** Pending. Satisfied, with its receipt. Blocked, with evidence
and a because. Waived, by a named authority with a because. Superseded, by a replacement gate, with
authority and because. A worker may challenge a gate with evidence; it can never weaken, waive or
reinterpret one. Only a person or a ratified policy waives, and the waiver is a receipt with that
person as its derivation.

**Receipts are content-addressed and carry their spend.** A gate runs in the node's worktree at the
debriefed commit. The receipt carries the SHA, the gate id, the check, the result, duration, an
output hash, its spend, and its derivation. Spend is none, metered, or local, and it decides what
revival does: a receipt that cost nothing is re-earned on revival; one that cost inference or money
is kept and never re-spent. An empty receipt is not a missing one: empty means no proof beyond the
check's own success, absent means the gate never ran. Same SHA and gate, same receipt, so re-running
is idempotent. A new commit makes every receipt stale, the same word with the same meaning as for
graph invalidation. Cleared is the type that carries one satisfied or waived receipt per declared
gate. It cannot be constructed short.

**Failure is the inner healing loop.** A failed gate holds the node with its receipt. Three things
are recorded separately and never collapsed: the failure, what happened and where; the disposition,
retry, repair, hold, cancel, or terminal failure; and the because, why that disposition is justified
under policy and the remaining budget. Retry re-runs the node with the failure receipt appended to
the brief, so the agent sees exactly what broke. The retry budget is a typed count owned by the
node; when it is spent the node is held for you. Repeated failures of one kind across nodes are a
discipline candidate for the substrate.

## The verifier

The verifier reads the debrief against the diff and the workspace and produces marks, never
verdicts. Its first form is entirely deterministic.

- Every decision cites a hunk, and the hunk exists in the diff at that SHA.
- Every discovery cites a location, and the file exists at that SHA with the quoted content.
- **Every hunk has a decision.** The inverse check, and the important one. A hunk no decision
  explains is marked unexplained. Unexplained change is the omission failure mode a self-report
  never confesses to.
- Every term is in one of the two vocabularies, or it is a gap.

A model enters later, only for claims code cannot check, only to mark, and every such mark carries
model, prompt and lens as its derivation so a verifier swap retracts its marks as a set. Marks and
gates compose without a new concept: a team may declare "no unexplained hunks" as a standing gate,
and then it blocks because the team chose that.

**Notes during, debrief after.** A session appends typed notes while it works: a choice, with what
was chosen and a mandatory because; a surprise, with what was expected and what was observed. Notes
are receipts, so they are the live form of the position without becoming an event stream. The
debrief closes the notes; it does not replace them. A session that ends without a debrief is
recorded as interrupted, and nothing is ever drafted on its behalf unless a person asks.

**The human in an editor.** The debrief is a file the brief asks for, and the runner validates its
schema. A person who did not write one trips the standing gate "debrief present and valid" and is
held. The escape hatch, on request only, is a post-hoc debrief: a model drafts one from the diff,
marked drafted rather than authored, and the verifier treats it like any other. Same protocol, no
special case.

## Derivation

Every receipt and every mark records who produced it. For a command gate that is the gate kind,
its version, and the runner. For a judgment it is the model, the versioned prompt, and the lens
active at the time. For a human gate it is the person. The derivation is required. It is never an
optional field, because an optional derivation becomes the field everyone skips.

Recording the judge makes three operations walkable that are otherwise invisible. Undo one
producer's run. Treat a model or prompt swap as a retraction event: "retract everything that judge
produced" is a query, not a rebuild. And decompose disagreement: when two review gates disagree,
the position shows two derivations side by side, and the disagreement reads as two lenses rather
than as noise. Your decision between them is recorded with its own derivation, you.

## Continuation versus measurement

A single-pass answer from a model is a continuation: it has no procedure and no derivation, only
fluency. A board over a decomposed question is a measurement: it has a stated way of settling and
a record of who settled it. Interlock exists to stop treating continuations as answers.

This decides where the expensive judgment goes. A large model's one advantage is that it holds
the whole in one context and finds the decomposition itself; boards cannot, they need it handed
to them. So the scarce judgment is spent once, at the interpreter, on the shape of the question,
and never on continuing the answer. The interpreter's output for an ask is two things: the graph,
which is the decomposition into settleable questions, and the read, a walkable statement of "I
understood your ask as these questions, settled by these means," which the person corrects.
Correcting the read is cheaper than correcting the answer, because a wrong read poisons every
answer beneath it. Every correction is a gap.

The interpreter may refuse. An ask that decomposes into no settleable question is a request for
an opinion, and the honest read says so. That refusal is itself an answer to what should have
been asked.

**Depth is a residue, not a property.** No router can know in advance which question is deep.
Depth is what survives decomposition: the question a board could not settle, or the board that
split and stayed split. Escalation is triggered by a declared failure to settle, first to a more
capable model, then to a person, never by a prediction of difficulty. A cheap model does not need
to understand depth; it needs to be able to say "I cannot answer this with the criteria given,"
and that is a gap, and gaps escalate. Nuance is the criterion not yet written down; a board's
disagreement points at it.

**The unit is settledness, not tokens.** A position on an inquiry says how much of the question
is settled with receipts, what remains unsettled, and why. Budget is a constraint on how many
draws each question gets. It is never a strategy, because tokens measure how much was spent
finding out and cannot measure whether anything was found.

**Strategy is declared; model is measured.** A strategy is typed: the graph shape, the gate kinds,
the aggregation rule per board, the escalation trigger. A person declares it and the interpreter
proposes it. Model assignment is a variable at each node's attempt, chosen inside the strategy,
and the answer to "which model for which work" is never a table someone writes. It is a
projection over receipts: for this gate kind under this strategy, this model settled it at this
spend with this rate of unresolved boards. Derivation and spend on every receipt are what make
that projection possible.

**Design, build, operate are three roles.** Deciding the composable questions and their rules
needs the most expensive judgment available. Building is hands. Operating the treadmill should be
the cheapest thing that can run it without thinking, and that is not a cheap model. It is code.
The chat interface fuses the three roles because one model does all of them there, and D2 exists
because that is a category error.

## Strategies

A strategy is a graph with holes. Nodes carry acceptance forms rather than acceptances, gates are
declared by kind and rule, roles are supplied per node, and every node carries its because: why
this gate here. Instantiation binds an ask into the holes and pins the strategy version.

Strategies improve by usage, as a projection and then a ratification, never as a rewrite in
flight. Discoveries repeated across instances say the context slice is missing something.
Unexplained hunks say a node boundary is wrong. The same gate failing across instances says a gate
is missing upstream. Boards that keep splitting on one node say the criterion is unstated. Float
and critical path across runs say the ordering is wrong. All of that projects a proposed next
version, a person ratifies it, and running graphs stay pinned to the version they started under.

A strategy is a procedure, and a procedure is compressed judgment, which is the founding failure:
it freezes consensus to the circumstances that produced it. So a strategy stays appealable per
instance. The interpreter may deviate from the shape with a recorded reason, and recurring
deviations are the strongest signal that the strategy should change. A strategy whose nodes carry
no because, or that cannot be deviated from, has become the checklist that rots.

Strategies are extracted from graphs that cleared, generalized after two or three instances,
never designed as a catalogue in advance. The bootstrap graph is the first candidate. They are
files beside graphs, so the harness with no substrate address still has them; a substrate makes
the projection across instances cheap and holds the ratification.

## Compatibility

Interlock's artifacts are its public API: graph, brief, notes, debrief, config, strategy, and the
persisted journal events beneath them. A shape written today must still be readable in two years.

- Every artifact names its shape and version on its first line. Readers accept every prior
  version forever and upgrade on read; writers write the latest. A file on disk is never rewritten
  to a new shape.
- Evolution is additive. A new field is optional. A required field or a rename is a new version
  with a reader for the old one. The rename from debrief v0 to v1 was the last free one.
- Few kinds. Adding an artifact kind needs the same justification a new noun does.
- The persisted journal is the surface that cannot be retrofitted: every event line carries its
  shape version from the first byte written, and replay routes through a versioned upcast seam.
  An unknown shape is a typed refusal, distinct from a truncated tail.
- A hand-authored file that is wrong gets a sentence, not a stack trace.
- The three substrate verbs are versioned like any other shape.
- The `open` section of every debrief is the shapes' own gap log; that is how the formats grow.

## The weekend

The ordinary failure case, not the catastrophic one. Saturday 13:00, sessions running on the home
server, you are away.

| case | answer | escape hatch |
| --- | --- | --- |
| Your side goes dark | Sessions run. Positions reach your phone the moment it has signal. Six verbs back. Nothing needs to reach in. | Tailscale, mosh, herdr attach when you have a laptop. |
| A fork needs you for twenty hours | The node is held with an expiry. Siblings proceed. A mandate covers the pre-ratified classes: who granted it, which action kind, in which context, until when, and why. You answer Sunday from the phone. | Expiry passes, the node stays held, Monday's position says so. |
| The server loses power | Crash-only restart. Leases expired, nodes reclaimed, outbox posts what it owes once. A receipt records it. No push. | None needed. You find out on Monday if you look. |
| The house loses internet | Not modeled. Sessions stall, ledger holds, resumes on reconnect. Waiting costs time, never correctness. | A UPS and a reboot. |

## What we expect to push against

| tension | lean | tie-breaker |
| --- | --- | --- |
| Small nodes vs ceremony per node | Small. | D12. Merge nodes before dropping a gate. |
| Typed debrief vs what the agent actually did | Mark unrooted, never block on it. | D6, I4. Measure the verifier. It never becomes trusting. |
| Closed vocabulary vs expressiveness | Closed. | D7, I3. Ratify from the gap log, into the domain vocabulary only. |
| Protocol floor vs rich adapter drilldown | Floor first. | D1. Adapters enrich, never required. A human in an editor must still fit. |
| herdr dependence vs owning the multiplexer | herdr. | D3, I6. Exposure is one adapter. Fallback is tmux. |
| Quiet hours vs urgency | Quiet. | D9. Only blocked, stalled, and a failed merge-path gate are real time. |
| Own terms vs adopter friction | Own terms. | D10. Make the exit cheap and say so. Practice over tool. |
| Model at the membranes vs deterministic middle | Models only at interpreter, editor, verifier. | D2, D13. Structure in the middle. Nothing between the membranes calls a model. |
| Mandates vs forks that are yours | Narrow mandates. | I10. Class, scope, typed expiry. Never blanket. |
| Phyxius as the ledger's spine vs plain code | Phyxius, first-class. | Where it reads worse than plain code, that is a finding about Phyxius, not a reason to bend interlock. |
| Verify everything vs inference throughput | Verify. | Sequence heavy fan-outs. Throughput is a scheduling concern, not a reason to skip. |

## Not modeled

- **The house going dark.** No local models, so the connection has to come back. Best-effort
  reconciliation on return.
- **100% uptime.** Reasonably usable with good escape hatches is the threshold.
- **An orchestrator model.** No LLM holds the system's state or decides what runs next.
- **Our own multiplexer.** herdr, or tmux as the degraded fallback.
- **Mid-conversation resume.** The node checkpoint is the recovery unit. herdr's native resume is
  a bonus where it works.
- **Multi-tenancy.** One ledger per person or per team, pointed at one substrate address. Sharing a
  substrate is an organisation's decision, made later, by config.

## Seams

This note is written before the code exists, so it does not pretend to make every decision. A
decision belongs here only if getting it wrong would close a seam we predict needing. Everything
else is the next thing added, in whatever order the first real use demands. Each seam names the
first thing through it.

| seam | first through it | added later through the same seam |
| --- | --- | --- |
| Gate kinds | The command gate. | Shape, review, human. Whether shape gates sit in the standing table by default is answered by the first repository that wants one. |
| Verifier marks | The deterministic hunk check. | Model-produced marks for claims code cannot check. |
| Graph as a file | The model as producer. | Hand-authored and scripted graphs work the moment the format exists. Let people play; the interlocking is in the ledger, not the interpreter. |
| Brief in, diff and debrief out | Whichever runtime is used tomorrow, in a herdr pane. | Every other runtime, and the post-hoc debrief that lets a human in an editor fit. |
| The face | A process in a herdr pane: conversation at the bottom, position and drilldown above. | The phone channel as a second door to the same face. Channel choice is last. |
| Substrate address | None. | A substrate, by three verbs. The reference implementation of the address is Preston. |

### Two seams that cannot be retrofitted

These are the only places where build-one-then-the-other does not hold, because the second cannot
be added without reopening the first. They are decided now.

- **Derivation is required on every receipt and mark from the first commit.**
- **The ledger is a Phyxius journal from day one.** Leases, receipts, transitions and outbox intents
  are appended events; state is a projection; crash-only recovery is replay. Clock makes stall
  thresholds unit tests. Typed handlers are the gate kinds, the verbs and the transitions. The outbox
  composes the journal with a drain; there is no separate effect primitive. Canonical logs are the
  drilldown. A reference implementation of the durable step with
  mandatory spend and receipt, and of the single-flight claim with heartbeat lease and
  revive-or-abandon sweep, already exists on the same Phyxius primitive and is read as prior art,
  never imported: keep its laws and its tests, rename its nouns.

## Bend log

Every time the design bends in use, an entry. A bend against a decision is expected and recorded. A
bend against an invariant means we redesign, and the entry says how.

| date | what bent | against | why | way back kept? | learned |
| --- | --- | --- | --- | --- | --- |
| 2026-09-09 | train → graph; parked → held; critical path, float, stale, cleared added | D13, vocabulary | A train asserts a linear shape the DAG does not have. Any single-object metaphor does. | Yes, v0 in history | Name the topology plainly; spend metaphor on behaviour words. |
| 2026-09-09 | Open questions → seams; gates, verifier and derivation sections added; Phyxius first-class | D5, D6, D13, vocabulary | Pre-repository, do not pretend to make every decision; leave seams for the evolutions we predict and build one then the other. | Yes, v0.1 in history | A pre-build note settles seams and the few non-retrofittable choices, not nuanced defaults. |
| 2026-09-09 | First session by hand (node `scaffold`): the brief's base SHA is the graph's base, but a session starts at the commit that contains its brief, which cannot be known while writing it; the brief carried no role; the debrief cannot mark a hunk as generated (a 1080-line lockfile has no line-by-line decision); "effect" was named as a Phyxius primitive and none exists | Brief and debrief shapes, seams | Writing the first brief and debrief by hand, as planned, before the formats had code. | Yes, both files committed with the session | Brief gets a `graph_base_sha`; the session's start SHA lives in the context column and the debrief; the brief supplies the role; the debrief gets a `produces` relation so a decision can own a generated hunk; the verifier treats generated hunks as explained by the decision that produced them. |
| 2026-09-09 | Rebasing the scaffold branch onto main rewrote every commit SHA; the debrief's `head_sha` and any receipt addressed by commit SHA went stale although not one byte under the node's code paths changed. The whole-repo tree changed too, because main had moved under docs the gates never read | Receipts, D5 | Content-addressing by commit SHA conflates content with history, and by whole-repo tree conflates the node's scope with everything else. | Yes, the pre-rebase SHA is in the debrief and the code paths are provably identical | Address a receipt by the content hash of the paths in the node's scope. A rebase or an unrelated docs merge that changes none of them keeps the receipt; a byte changed under them invalidates it. The commit SHA stays on the receipt as history, not identity. |
| 2026-09-09 | Ledger node (second hand-run session, first under a workflow): the two professed gate commands in the graph could not run at all (pnpm option order, vitest has no --grep); persisted events carried no shape version; durability rode on a drain whose published stop() can lose an in-flight write; the debrief's decisions covered six notable choices and left 26 of 40 files unexplained; "disposition" was used as a type without a vocabulary row | Graph, vocabulary, I8, compatibility | Professed commands are professed until they run; the persisted journal is the one artifact whose version cannot be added later; Phyxius's drain read worse than a synchronous append for a ledger that writes a few events a minute; decisions are a manifest of the diff, not a highlights reel. | Yes, every finding is in the session's debrief and notes | Graph gate commands bent to the invocations that run; every journal line now carries `interlock: event@v1` with an upcast seam; drain replaced by a synchronous sink and reported upstream; disposition ratified into the vocabulary; a debrief's decisions must cover every changed file, and the mechanical ones are cheap to write. |
| 2026-09-09 | Node `ledger-gaps` added between `ledger` and the runner; the runner's acceptance gains the receipt backfill as its first act | Graph | The face exposed four shape gaps and a per-worktree journal; closing them is its own node because it moves the persisted shape to `event@v2`, the first real use of the upcast seam. Editing the graph stales its approval; it is re-approved on the new content. | Yes, previous graph in history | The first re-approval under D20 is made by the person, with the command the previous node built. |
| 2026-09-09 | `face-read` cleared. `interlock graph show` renders the bootstrap graph with `scaffold` as ready and `ledger` as blocked on it, although both are cleared and merged: their gates ran by hand and their receipts live in pull-request bodies, not in the journal. The ledger package now resolves under raw Node through explicit `.ts` specifiers and a `main` pointing at source, a consequence of running the CLI without a build step | D14, D5, receipts | The face reads the journal and nothing else, so a receipt that was never written to it does not exist for the face. That is correct, and it exposes that the first two nodes were cleared outside the ledger. | Yes, the receipts are in PRs #2 and #4 | The runner's first act is to re-run the standing gates for every cleared node at main and write their receipts, so the position stops depending on anyone's memory. `approved` enters the vocabulary as a gate id and a three-valued state. |
| 2026-09-09 | `face` split into `face-read` (depends on `ledger`) and `face` (depends on the runner); graph-level human gate `approved` added to the bootstrap graph; D20 written | Graph, D20 | Every plan is read and approved before any of it runs. The read-only slice of the face needs the ledger and the graph file, not the runner, as 0002 argued; the approval gate is the interlocking applied to plans. | Yes, previous graph in history | The first plan approved under the new gate is the one that builds the approver. |
| 2026-09-09 | Carried over from a prior work algebra: five gate states; cancelled and superseded terminals; failure / disposition / because; conserved retry budget; spend on receipts and spend-driven revival; empty receipt ≠ absent; abandoned written by a sweeper; lease bounds silence; outbox with an honest uncertain state; typed notes during the session; interrupted gets no invented debrief; role supplied by the brief; mandate spelled | D8, D12, I7, gates, verifier, lifecycle, vocabulary | The same laws were written a month earlier inside the substrate and each carried an incident that earned it. Carry what makes sense, leave what does not: the substrate's belief analysis and ratification doors stay on its side. | Yes, v0.2 in history | I7 had promised exactly once. Nothing can. Promise no lost intent and honest doubt instead. |

---

What this note is not: a plan. Plans are commentary. The plan is `.interlock/graphs/0001-bootstrap.yaml`,
and the first bend log entries that graph produces will tell us which of the above we got wrong.
