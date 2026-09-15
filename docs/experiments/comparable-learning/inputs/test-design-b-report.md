<!-- interlock: experiment-test-design@v1 -->

# Citation and learning boundary test design

This is a design for focused regression cases, not a claim that the verifier can
settle a statement's meaning. Source inspection found no defect claim to make:
the cases distinguish the implemented boundaries and identify where direct tests
do not yet cover the complete flow.

## 1. A true quotation does not establish its interpretation

Fixture input: commit `src/cache.ts` containing `export const cacheEnabled = true;`.
Submit a discovery whose `what` says “cache use is disabled” and whose `found_at`
is `src/cache.ts:1 "export const cacheEnabled = true;"`.

Expected result: citation verification produces a rooted mark for `src/cache.ts`;
reuse may carry the supplied discovery statement as a path-scoped hypothesis. It
must not change, reject, or otherwise adjudicate the contradictory `what`.

Boundary distinguished: proof that an exact extract occurs at a location versus
the truth of the interpretation built from that extract. The expected hypothesis
status is deliberately not a semantic verdict.

Current source/test check: `packages/verifier/src/foundAt.ts:157-164` returns a
rooted mark when the selected source range includes the quote:

> `return sourceRange.includes(quote) ? mark.rooted(derivation, resolved) :`

`packages/substrate/src/evidence.ts:98-109` only requires a rooted mark before
building an item with `standing: "hypothesis"`:

> `if (entry.mark.kind !== "rooted") return undefined;`

Current coverage: no. `packages/verifier/test/foundAt.test.ts:83-104` covers a
present and an absent quotation, but neither pairs a present quotation with a
contradictory discovery statement. This proposal should span verification and
evidence conversion so that the non-semantic boundary remains explicit.

## 2. A quoted out-of-band citation stays reusable but has repository scope

Fixture input: a discovery with no resolvable path, such as `found_at: 'external
tool output: "cache is cold"'`, plus a normal discovery statement and reason.
Pass its verifier mark to evidence conversion.

Expected result: verification roots the citation at `out-of-band citation`.
Evidence conversion yields a hypothesis item scoped to the repository, never a
guessed path.

Boundary distinguished: a quotation is a citation form even when this repository
cannot resolve a path; this is different from free text with neither path,
command, nor quotation.

Current source/test check: `packages/verifier/test/foundAt.test.ts:273-282`
already asserts that a quoted citation without a resolvable path is rooted:

> `it("roots a quoted out-of-band citation with no resolvable path", () => {`

`packages/substrate/src/evidence.ts:48-49,98-102` names that sentinel and maps it
to repository scope:

> `const SENTINEL_HUNKS: ReadonlySet<string> = new Set(["command", "out-of-band citation"]);`

Current coverage: partial. The verifier unit test and the evidence unit test at
`packages/substrate/test/evidence.test.ts:211-228` cover each endpoint; the
runner integration at `packages/runner/test/gateJudge.test.ts:953-1047` exercises
only a path-resolved discovery. Add this one end-to-end case if an integration
regression is wanted.

## 3. A correct extract at the wrong explicit line is excluded from reuse

Fixture input: commit `src/widget.ts` with `export interface Widget {` at line 1;
submit a discovery with `found_at: src/widget.ts:2 "export interface Widget {"`.

Expected result: the mark is unrooted because the quoted extract is outside the
declared range, and no discovery item is emitted for reuse.

Boundary distinguished: a file-level text match is insufficient for an explicit
location; the quote must occur in the stated line range.

Current source/test check: `packages/verifier/test/foundAt.test.ts:182-191`
already expresses this rule:

> `it("unroots an explicit quote outside its declared range even when it appears elsewhere", () => {`

The runner integration supplies the analogous end-to-end filtering check with a
nonexistent fourth line at `packages/runner/test/gateJudge.test.ts:979-1038`:

> `expect(evidence.items).not.toContainEqual(`

Current coverage: yes. No new test is needed unless case 1 or 2 changes this
flow; retain this as the comparison control for those additions.

## 4. Multiple rooted decision paths become a repository-scoped item and a gap

Fixture input: one decision with two rooted hunk citations,
`src/cache.ts:1` and `package.json:1`, and otherwise valid decision fields.

Expected result: the reusable decision is a hypothesis item scoped to the
repository and emits one scope gap; it must not select either path as though it
were the sole support.

Boundary distinguished: complete citation proof versus a single-path scope that
the reusable item can represent.

Current source/test check: `packages/substrate/src/evidence.ts:87-95` preserves
the item while recording the lost path precision:

> `difference: \`cites ${paths.length} paths (${paths.join(", ")}); item@v1's scope carries only one, so this item is scoped to the repository instead\`,`

`packages/substrate/test/evidence.test.ts:95-139` directly asserts repository
scope and a gap for two rooted paths:

> `it("scopes a single-path decision to that path, and a multi-path decision to the repository", () => {`

Current coverage: yes at conversion level. It is a useful control case; an
additional runner integration test is optional rather than evidence of a defect.
