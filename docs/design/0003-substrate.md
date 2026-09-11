# Substrate

Design note · v1.0 · 2026-09-11

Interlock owns the structure of work and none of the knowledge about the code. A substrate owns
beliefs about the code, the team's conventions and values, and the record of what earlier
sessions decided. The two meet in the brief and in the debrief. This note defines the contract
between them as a protocol any substrate can implement, so that plugging one in is a matter of
answering a few typed calls, and so that the way knowledge compounds is visible in the shapes
rather than asserted in prose.

| | |
| --- | --- |
| Status | `substrate@v1`, schemas written: one request and one response per verb under `schemas/substrate/`, plus a `capabilities` response. Nothing in interlock consumes the protocol yet; the note and the schemas precede the client so a substrate can implement it first. |
| Owner | Rodrigo Sasaki, own repository, Apache 2.0. |
| Reference implementation | Named once, in the mapping section below, and nowhere else in this note, in code, in a schema, or in a test. |
| How to read | Decisions are D-numbered, continuing from 0002. The verbs are the spine; the payloads point at the artifact schemas under `schemas/`, and at their own request/response schemas under `schemas/substrate/`. |

## Two protocols, one meeting point

The **session protocol** is the agent's side and it is three files: a brief in, notes during,
a debrief out beside the diff. Any hands conform by reading one file and writing two.

The **substrate protocol** is the other side. It is render, parse and walk, in three words that
were already the harness's own: render a context slice for a node, absorb what a session
learned, answer a question during the session.

They meet in the brief. The substrate renders a slice as typed items; interlock writes them into
the brief's body as prose a person or an agent reads, and puts the substrate's address in the
brief's front matter (`brief@v1.json`'s `substrate.address`, already the shape `substrate:
address: none` carries when no substrate is addressed). That front matter also carries an
optional `substrate.handle`: an opaque routing detail a client may set when addressing costs more
than the bare address says, minted however the client sees fit. No verb in this protocol returns
one; `context`'s own response is the slice and the vocabulary, nothing more, so a session walks by
calling `query` and `consult` directly against the address it already holds. Interlock never
walks. Every walk the session makes beyond its slice is recorded as a discovery, and discoveries
are what tell the substrate its slice was short. Slice, walk, discovery, next slice: that loop is
the compounding, and it is visible in the shapes.

## The verbs

A substrate implements two verbs. Everything else it declares as a capability, and interlock
degrades per capability. An address of none implements nothing and everything still runs.

| verb | direction | when | if absent |
| --- | --- | --- | --- |
| `context` | render | when a brief is composed for a node | the brief carries only the ask and the repository |
| `absorb` | parse | when a session is judged | discoveries go nowhere; knowledge does not compound |
| `consult` | render | mid-session, on a stated intent | the agent decides without the fork door |
| `query` | read | mid-session | the agent walks nowhere beyond its slice |
| `why` | read | mid-session, on one item | positions carry no derivation from the substrate |
| `note` | parse, live | at each choice or surprise | notes travel inside `absorb` |
| `open` / `close` | envelope | session start and end | notes have no live envelope on the substrate's side |
| `propose` / `ratify` | parse, two-step | when a session states a standing rule | a session cannot propose a rule |
| `contest` | parse | when a session disagrees with a belief | a session cannot push back on a stale belief |
| `judge` | gate producer | when a review gate is declared | no review gate from this substrate |

One more answer, not a verb in this table: `capabilities`, so interlock learns which of the ten
declared capabilities above a substrate actually implements before it can degrade per capability
(D22). It takes no request beyond the address interlock already holds; its response schema is
`schemas/substrate/capabilities.response.json`, a list drawn from exactly the ten capability names
this table carries.

Outside the protocol on purpose: a person's controls over the substrate's own voice, such as
quieting a category of findings or surfacing a withheld one. Those are a person's verbs at the
face, not a session's.

## Payloads

Every payload is an artifact or a list of items with provenance. Shapes are JSON Schemas under
`schemas/substrate/`, one request and one response per verb, `$id` ending in
`substrate@v1/<verb>.request.json` and `<verb>.response.json`; the artifacts they carry are
`$ref`erenced from the schemas under `schemas/`, never redefined.

- **`context(node, scope, role)` → slice.** `context.request.json`, `context.response.json`. A
  slice is a list of items (`item@v1.json`, unchanged from 0002). Each item has a kind
  (convention, discipline, decision, risk, value, tension, absence), a statement in the team's
  words, an optional because, a scope (repository, path, or organisation), a standing (ratified,
  professed, observed, hypothesis), and a derivation: who produced it and how. The slice also
  carries the substrate's version of its own vocabulary, so the interpreter can translate. The
  brief renders each kind as a section and keeps the derivation beside each item.
- **`absorb(debrief, notes, receipts)` → acknowledgement.** `absorb.request.json`,
  `absorb.response.json`. The debrief is `debrief@v2`, the notes `notes@v0`, the receipts the
  node's (`parts/receipt.json`) — all three confirmed still current against `schemas/` as this
  session left it. The substrate returns what it did with them: the ids of the decisions it
  adopted as beliefs, one placement (known, new, unplaced) per discovery id, and the discoveries
  it could not place, carried as `parts/gap.json` entries. That last list is the gap log's food.
- **`consult(intent, scope)` → posture.** `consult.request.json`, `consult.response.json`. Items
  as in a slice, selected against a stated intent. A prior decision that bears on the intent needs
  no separate field: `decision` is already an item kind. Unlike a slice, a posture carries no
  vocabulary version of its own.
- **`query(question, scope)` → items.** `query.request.json`, `query.response.json`. The walk.
  Same item shape.
- **`why(ref)` → chain.** `why.request.json`, `why.response.json`. The justification of one item,
  carried as a chain of the verifier's own marks (`parts/mark.json`, unchanged): rooted names the
  hunk a step was observed in, unrooted names the because it rests on instead, gap names a step
  that named no vocabulary term — exactly how a debrief claim's own way back is marked, reused
  rather than parallelled. `ref` is an opaque handle a substrate mints for an item it has rendered
  elsewhere in its own surface; `item@v1` carries no id of its own. This is the way back, and it
  is why `why` is not a mode of `query`.
- **`note(session, note)`** and **`open(session, brief)` / `close(session, reason)`.**
  `note.request.json`/`note.response.json`, `open.request.json`/`open.response.json`,
  `close.request.json`/`close.response.json`. The live envelope. A substrate that has one
  attributes each note as it happens — `note.response` carries the `derivation` it attributed the
  note to; one that does not gets the same notes folded into `notes@v0` inside `absorb` instead.
  Independent of either path, the journal already carries each note as its own `note-appended`
  event (`event@v4`), so nothing about a live envelope is required for a note to be durable —
  only for it to be attributed as it happens rather than after the session ends.
- **`propose(rule, because)` → handle; `ratify(handle, who)`.** `propose.request.json`,
  `propose.response.json`, `ratify.request.json`, `ratify.response.json`. A standing rule enters
  only by a person's second call: `propose` returns a handle to the candidate; `ratify` returns it
  as a real item, standing `ratified`. The substrate never adopts a rule on its own.
- **`contest(ref, stance, because)`.** `contest.request.json`, `contest.response.json`. Agree or
  disagree with an item, with a because. Records a stance; resolves nothing by itself.
- **`judge(request)` → verdict.** `judge.request.json`, `judge.response.json`. A review request
  with the diff and the brief; the verdict is a gate receipt of kind review, literally —
  `judge.response.json` is a bare `$ref` to `parts/receipt.json`, never redefined — with a
  derivation naming the lens.

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

**D24. Interlock never walks; the session does, against the address the brief already carries.**
Every walk beyond the slice is a discovery in the debrief, and `absorb` is where the substrate
learns its slice was short. `context`'s response carries no walk handle of its own; if a client
needs one, it is the brief's existing, optional `substrate.handle`, unrelated to this protocol's
typed payloads.
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
| 2026-09-11 | Header table named the reference implementation twice (its own row, plus the mapping section's intro) | The wall; the brief's own fence ("named exactly once in the note and nowhere else") | Writing the schemas surfaced it: nothing needed the name in two places, and the draft had simply carried both from when the note was written in one pass | Yes — the header row now points at the mapping section instead of repeating the name | A rule this explicit is worth grepping the note for before calling it done, not just reading past |
| 2026-09-11 | D23/D24's "walk handle in the brief's front matter" turned out to name a field (`brief@v1.json`'s `substrate.handle`) that no verb in this session's actual payload set produces | D23, D24 | This session's own brief narrowed `context`'s response to "a slice of items plus the substrate's vocabulary version," with no handle; building the schema against that instruction surfaced the gap against the note's looser prose | Yes — the note now says plainly that no verb returns one, and a client that wants one mints it itself | A design note's prose can imply a payload field a session's own brief never asks for; the shapes, once real, are what settle it |

No verb payload itself has bent from what this note asked for; the two rows above are the note
catching up to the schemas, not the schemas bending to fit the note.
