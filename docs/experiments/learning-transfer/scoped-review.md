# Scoped review: query selection and work authority

## Current read

The current implementation keeps work authority separate from query selection. At session dispatch, the runner obtains the authoritative scope from `git ls-files`; it uses `context_scope` only as the context-query list, falling back to that full tracked list when the selector is omitted. Before the query, every selected string must be an exact member of the tracked set. The persisted worktree brief is then rewritten with the full authoritative scope, while the optional selector remains separately represented. [packages/runner/src/sessionBrief.ts:75-116] [packages/runner/src/briefRewrite.ts:83-108]

That is a source-checked match for the stated boundary: selection can narrow the substrate request, but it does not replace the runner's authority. The selector's allowed membership is the complete current tracked set, not the repository brief's prior `scope` list; this is intentional in the observed flow because that list is overwritten from `gitTrackedFiles` after the check. This review makes no claim about paths outside the runner's exact-string and tracked-file checks, such as how another component may later resolve a selected path.

The opening view preserves the selected paths when present, but exposes the full scope only as a count, a SHA-256 of `UTF-8 JSON.stringify(scope)`, and a canonical-brief path. It says the canonical brief remains binding. [packages/runner/src/openingView.ts:14-52] The session test checks both the omitted full entries and the retained selector. [packages/runner/test/sessionBrief.test.ts:98-176]

## Backward compatibility

For a `brief@v1` that omits `context_scope`, parsing returns `undefined`, and the runner queries the full tracked scope. The targeted test captures that full list for an addressed substrate. [packages/debrief/src/brief.ts:146-168] [packages/runner/src/sessionBrief.ts:75-96] [packages/runner/test/sessionBrief.test.ts:245-270] Thus the selector is additive for existing v1 briefs rather than changing their query breadth.

This does not make an older `brief@v0` dispatchable: the session writer still returns its typed `legacy` refusal before selection. [packages/runner/src/sessionBrief.ts:71-74] The compatibility conclusion is limited to omitted selectors on v1; it is not a claim that the runner accepts every historical brief shape.

## Refusal and `none`

The parser rejects a selector that is not a non-empty string list, repeats a string, is absolute, or escapes the repository root. [packages/debrief/src/brief.ts:146-168] The parser test exercises each of those cases and also shows that a normalized spelling can pass this structural check. [packages/debrief/test/brief.test.ts:206-271]

The runner adds the consequential authority check: it rejects the first selected string that is not an exact tracked spelling before calling `substrate.context`. [packages/runner/src/sessionBrief.ts:75-96] The tests cover both a missing path and the reader-safe alias `tracked/../tracked.ts`, and assert zero context calls in each case. [packages/runner/test/sessionBrief.test.ts:179-243] Since the return also precedes the later `writeFile` branch, this refusal does not reach either the context query or the worktree write in this function. [packages/runner/src/sessionBrief.ts:80-85] [packages/runner/src/sessionBrief.ts:119-128]

With no substrate addressed, a valid selector is accepted. The runner still obtains a context outcome, retains the original body unless that outcome is rendered, and the test observes the `context none: no substrate addressed` narration. [packages/runner/src/sessionBrief.ts:92-116] [packages/runner/test/sessionBrief.test.ts:272-290] This is consistent with the design requirement that an unset address leaves the harness running, merely without the addressed context slice. [docs/design/0001-interlock.md:110-116]

## Brief-provided items checked

- `Added optional context_scope to brief@v1 ... preserve omitted-selector legacy behavior.` Its stated derivation is `agent:codex:gpt-5.6-terra`. The parser's optional branch and the full-scope fallback support the narrowed claim in this report. [packages/debrief/src/brief.ts:146-168] [packages/runner/src/sessionBrief.ts:75-96]
- `Kept full gitTrackedFiles scope canonical ... every selected spelling exactly matches a tracked path.` Its stated derivation is `agent:codex:gpt-5.6-terra`. The runner source and missing-path/alias tests support it. [packages/runner/src/sessionBrief.ts:75-116] [packages/runner/test/sessionBrief.test.ts:179-243]
- `Preserved context_scope entries ... actual addressed 3,000-path runtime query carries exactly its three selected paths before prompt.` Its stated derivation is `agent:codex:gpt-5.6-terra`. The current test proves the general selected-list handoff with one path, not that specific 3,000-path/three-path runtime quantity; that quantity did not inform a conclusion here. [packages/runner/test/sessionBrief.test.ts:138-176]
- The three `Nothing is held about ...` items have derivation `preston:coverage@v1`. They state substrate coverage absence, not current parser or runner behavior, so they did not inform this source review.

## Scope and limit

This is an assessment only. It changes no implementation or tests, and it does not treat repeated wording in the supplied hypotheses as evidence of improved judgment. The source and targeted tests establish the listed control flow; they do not, by themselves, establish substrate-side file-resolution behavior or the cited production-scale query count.
