# Citation and reusable-evidence test design

This proposes three regression cases at the seams between discovery citation,
verification, and reusable evidence. They describe expected current behaviour;
none asserts that a rooted citation establishes the meaning of the surrounding
statement.

## 1. A true quotation does not establish a false interpretation

Fixture input: commit `src/widget.ts` with line 1 exactly
`export interface Widget {`. Submit a discovery whose `what` is `Widget is a
class with a runtime constructor`, whose `found_at` is
`src/widget.ts:1 "export interface Widget {"`, and whose `mattered_because` is
any nonempty value. Run it through `verifyDebrief`, then `evidenceOf`.

Expected result: the discovery is marked `rooted` at `src/widget.ts`, and the
evidence item retains the submitted statement as a hypothesis scoped to that
path. The assertion must explicitly say that this is a citation-membership
result, not a decision about whether an interface is a class or has a runtime
constructor.

Boundary distinguished: a line-range quotation can prove that text occurs in a
committed file, while it cannot settle the interpretation of that text. This is
an intended limit, not a source defect.

Current source/test check:

> `packages/verifier/src/foundAt.ts:157-162` checks
> `sourceRange.includes(quote)` and roots or unroots from that result.

> `packages/substrate/src/evidence.ts:103-109` sets a rooted discovery item's
> `statement` from `entry.discovery.what`.

> `packages/verifier/test/verify.test.ts:157-167` supplies the aligned statement
> `Widget is declared in the source file` with the same interface quotation.

Current coverage: no. The current test proves an aligned wording roots; it does
not demonstrate that a true quotation remains insufficient to validate a false
interpretation.

## 2. An unrooted decision is not reusable at the handoff seam

Fixture input: in the existing runner-style fixture, commit `src/widget.ts`.
Submit a decision with hunks `src/widget.ts:1-3` and `no-such-file.ts`, then run
the judge with a substrate spy.

Expected result: verification groups a rooted and an unrooted mark under that
decision, and the spy receives no item whose statement is the decision's
`what`. A valid gate receipt may still be present. This asserts filtering of a
marked decision, not a failure of the node outcome.

Boundary distinguished: verifier marks retain the failed citation for drilldown;
the reusable-evidence conversion admits a decision only when every supplied
hunk is rooted.

Current source/test check:

> `packages/substrate/src/evidence.ts:74-76` returns no decision result when
> there are zero marks or any mark is not rooted.

> `packages/verifier/test/verify.test.ts:141-154` expects the grouped marks
> `['rooted', 'unrooted']` and the corresponding flat marks.

> `packages/runner/test/gateJudge.test.ts:1035-1039` checks exclusion through
> the runner handoff, but for an unrooted discovery rather than a decision.

Current coverage: partial. The verifier and evidence unit cases cover the two
halves, while the runner integration does not prove their composition for an
unrooted decision.

## 3. Two rooted decision paths retain their breadth as a gap

Fixture input: commit both `src/one.ts` and `src/two.ts`. Submit one decision
with valid hunks `src/one.ts:1` and `src/two.ts:1`, run verification, then hand
the result to the substrate spy.

Expected result: the spy receives one hypothesis decision item scoped to the
repository and one gap with term `decision <id> scope`, nearest `path`, and a
difference naming both paths. It must not select either path as the decision's
scope.

Boundary distinguished: converting several rooted citations to an item with a
single-path scope keeps the loss visible as a gap instead of silently narrowing
the evidence.

Current source/test check:

> `packages/substrate/src/evidence.ts:87-95` returns a repository-scoped item
> and a gap when a decision cites more than one path.

> `packages/substrate/test/evidence.test.ts:95-138` expects repository scope
> and a `decision c9 scope` gap for `a.ts` plus `b.ts`.

> `packages/runner/test/gateJudge.test.ts:1024-1046` proves a single-path
> decision reaches the substrate, but does not inspect multi-path scope or gaps.

Current coverage: partial. The conversion is unit-covered; an integration case
would hold the verifier-to-handoff boundary.
