# Substrate

Design note · v0.1 · 2026-09-10 · draft, awaiting read

Interlock owns the structure of work and none of the knowledge about the code. A substrate owns
beliefs about the code, the team's conventions and values, and the record of what earlier
sessions decided. The two meet in the brief and in the debrief. This note defines the contract
between them as a protocol any substrate can implement, so that plugging one in is a matter of
answering a few typed calls, and so that the way knowledge compounds is visible in the shapes
rather than asserted in prose.

| | |
| --- | --- |
| Status | Draft. The protocol is `substrate@v1`. Nothing in interlock consumes it yet; the note precedes the client so a substrate can implement it first. |
| Owner | Rodrigo Sasaki, own repository, Apache 2.0. |
| Reference implementation | Preston, named here once. The mapping of its doors to these verbs is in the last section. |
| How to read | Decisions are D-numbered, continuing from 0002. The verbs are the spine; the payloads point at the artifact schemas under `schemas/`. |

## Two protocols, one meeting point

The **session protocol** is the agent's side and it is three files: a brief in, notes during,
a debrief out beside the diff. Any hands conform by reading one file and writing two.

The **substrate protocol** is the other side. It is render, parse and walk, in three words that
were already the harness's own: render a context slice for a node, absorb what a session
learned, answer a question during the session.

They meet in the brief. The substrate renders a slice as typed items; interlock writes them into
the brief's body as prose a person or an agent reads, and puts the substrate's address and a walk
handle in the brief's front matter. Interlock never walks. It passes the handle. Every walk the
session makes beyond its slice is recorded as a discovery, and discoveries are what tell the
substrate its slice was short. Slice, walk, discovery, next slice: that loop is the compounding,
and it is visible in the shapes.

## The verbs

A substrate implements two verbs. Everything else it declares as a capability, and interlock
degrades per capability. An address of none implements nothing and everything still runs.

| verb | direction | when | if absent |
| --- | --- | --- | --- |
| `context` | render | when a brief is composed for a node | the brief carries only the ask and the repository |
| `absorb` | parse | when a session is judged | discoveries go nowhere; knowledge does not compound |
| `consult` | render | mid-session, on a stated intent | the agent decides without the fork door |
| `query` | read | mid-session | no walk handle in the brief |
| `why` | read | mid-session, on one item | positions carry no derivation from the substrate |
| `note` | parse, live | at each choice or surprise | notes travel inside `absorb` |
| `open` / `close` | envelope | session start and end | notes have no live envelope on the substrate's side |
| `propose` / `ratify` | parse, two-step | when a session states a standing rule | a session cannot propose a rule |
| `contest` | parse | when a session disagrees with a belief | a session cannot push back on a stale belief |
| `judge` | gate producer | when a review gate is declared | no review gate from this substrate |

Outside the protocol on purpose: a person's controls over the substrate's own voice, such as
quieting a category of findings or surfacing a withheld one. Those are a person's verbs at the
face, not a session's.

## Payloads

Every payload is an artifact or a list of items with provenance. Shapes are JSON Schemas under
`schemas/substrate/`; the artifacts they carry are the ones under `schemas/`.

- **`context(node, scope, role)` → slice.** A slice is a list of items. Each item has a kind
  (convention, discipline, decision, risk, value, tension, absence), a statement in the team's
  words, an optional because, a scope (repository, path, or organisation), a standing (ratified,
  professed, observed, hypothesis), and a derivation: who produced it and how. The slice also
  carries the substrate's version of its own vocabulary, so the interpreter can translate. The
  brief renders each kind as a section and keeps the derivation beside each item.
- **`absorb(debrief, notes, receipts)` → acknowledgement.** The debrief is `debrief@v2`, the
  notes `notes@v0`, the receipts the node's. The substrate returns what it did with them: which
  decisions became beliefs, which discoveries were already known, which were new, and which
  discoveries it could not place. That last list is the gap log's food.
- **`consult(intent, scope)` → posture.** Items as in a slice, selected against a stated intent,
  plus prior decisions that bear on it.
- **`query(question, scope)` → items.** The walk. Same item shape.
- **`why(ref)` → chain.** The justification of one item: how it was observed, what it rests on,
  who produced each step. This is the way back, and it is why `why` is not a mode of `query`.
- **`note(session, note)`** and **`open(session, brief)` / `close(session, reason)`.** The live
  envelope. A substrate that has one can attribute notes as they happen; one that does not gets
  them in `absorb`.
- **`propose(rule, because)` → handle; `ratify(handle, who)`.** A standing rule enters only by a
  person's second call. The substrate never adopts a rule on its own.
- **`contest(ref, stance, because)`.** Agree or disagree with an item, with a because. Records a
  stance; resolves nothing by itself.
- **`judge(request)` → verdict.** A review request with the diff and the brief; a verdict with a
  derivation naming the lens. The verdict is a gate receipt of kind review.

## Decisions

**D22. The substrate is a protocol of two required verbs and declared capabilities.** A substrate
that renders context and absorbs debriefs is complete. Everything else is optional and interlock
degrades per capability rather than requiring the fuller substrate.
*Cost:* a rich substrate is not exercised fully by a minimal client.
*Revisit:* a third required verb needs a written justification here.

**D23. The slice is typed items with provenance, rendered into the brief by interlock.** The
substrate returns items; interlock renders them. A person in an editor and an agent in a pane
read the same knowledge in the same brief, and the face can show the same items.
*Cost:* a rendering step interlock owns, and a vocabulary translation at the interpreter.
*Revisit:* if a substrate wants to render its own prose, the item carries an optional rendered
form, never instead of the typed fields.

**D24. Interlock never walks; the session does, through a handle the brief carries.** Every walk
beyond the slice is a discovery in the debrief, and `absorb` is where the substrate learns its
slice was short.
*Cost:* a substrate without `query` gets no mid-session signal from sessions.
*Revisit:* no.

**D25. The protocol is versioned apart from the artifacts it carries.** `substrate@v1` accepts
`debrief@v2` and `notes@v0` and returns items at `item@v1`. A new artifact version is a new
accepted version in the protocol, not a new protocol.
*Cost:* the protocol lists what it accepts, and a substrate reads that list.
*Revisit:* no.

## Mapping the reference implementation

The doors Preston exposes today, mapped to the verbs. Nothing is lost that a session actually
walks: sessions orient at boot, consult at forks, ask why on a flagged item, record a decision,
note a choice or surprise, establish a rule, request a review, and debrief at the end.

| verb | doors |
| --- | --- |
| `context` | orient, brief, start_here |
| `consult` | consult |
| `query` | risks, tensions, promises, reviews, codebases, session |
| `why` | why |
| `absorb` | record, note, debrief, feedback |
| `note` | note |
| `open` / `close` | the session id a brief returns; close_session |
| `propose` / `ratify` | establish, ratify |
| `contest` | challenge, affirm |
| `judge` | request_review, reviews, mark_review_item |
| outside | hold, lift, unfold |

## Not modeled

- A substrate that writes to the repository. The substrate holds beliefs; the harness holds work.
- Interlock as a substrate. The ledger is a record of work, not of beliefs about code.
- Multiple substrates per graph. One address per ledger, as 0001 decided.

## Bend log

| date | what bent | against | why | way back kept? | learned |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

*Nothing has bent yet. No client exists.*
