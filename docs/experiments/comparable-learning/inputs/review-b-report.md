interlock: review@v1

# Citation and reusable-evidence review

Scope: current citation verification, evidence conversion, and the runner's evidence handoff. The direct boundary check was `mise exec -- pnpm --filter verifier exec vitest run test/foundAt.test.ts -t 'roots exact final real lines and rejects each adjacent out-of-bounds line'`; it passed one test with 17 skipped.

## 1. Demonstrated property — explicit source citations are bounded to their declared lines

Current path: `packages/verifier/src/foundAt.ts:157-162`.

Exact line quotation:

> `const sourceRange = lines.slice(range.start - 1, range.end).join("\n");`
>
> `return sourceRange.includes(quote)`
>
> `  ? mark.rooted(derivation, resolved)`

Reasoning: an explicit location is checked against only its parsed inclusive range, not against the file generally. The direct run independently exercised both newline states at the final real line and the next line beyond each file; the test passed, which supports the boundary behavior rather than merely its test title.

## 2. Defect — command-shaped text can become reusable evidence without command proof

Current paths: `packages/verifier/src/foundAt.ts:111-113`; `packages/substrate/src/evidence.ts:98-110`.

Exact line quotations:

> `if (STARTS_A_COMMAND.test(trimmed)) {`
>
> `  return mark.rooted(derivation, "command");`

> `if (entry.mark.kind !== "rooted") return undefined;`
>
> `statement: entry.discovery.what,`
>
> `standing: "hypothesis",`

Reasoning: a `found_at` string whose trimmed text starts with `$ ` is rooted immediately; this check neither runs the command nor connects an output or exit status to the discovery. A rooted discovery is then converted to a hypothesis item. Therefore command-shaped prose can be carried as reusable evidence despite no harness-held command proof. The existing focused test deliberately confirms the first half of this behavior, but it does not establish a command ran.

## 3. Unproven concern — a matched quotation supports textual location, not a causal conclusion

Current path: `packages/substrate/src/evidence.ts:103-109`.

Exact line quotation:

> `return {`
>
> `  kind: discoveryItemKind(entry.discovery),`
>
> `  statement: entry.discovery.what,`
>
> `  because: entry.discovery.matteredBecause,`

Reasoning: the prior check proves only that the quoted extract occurs in the nominated source range. This conversion retains the discovery's own statement and because; it does not evaluate whether the extract entails the stated cause, whether another condition caused the result, or whether the source is representative. A rooted mark is therefore a traceable location claim, not proof of the causal conclusion. This is an unproven concern rather than a defect: the reviewed code does not promise semantic or causal inference.

## 4. Demonstrated property — the runner's integration fixture filters an invalid source-line discovery before handoff

Current path: `packages/runner/test/gateJudge.test.ts:1027-1038`.

Exact line quotation:

> `expect(evidence.items).toContainEqual(`
>
> `  expect.objectContaining({`
>
> `    kind: "absence",`

> `expect(evidence.items).not.toContainEqual(`
>
> `  expect.objectContaining({`
>
> `    statement: "no test yet covered a nonexistent fourth source line",`

Reasoning: the fixture runs a real `verifyDebrief` pass, retains the discovery rooted at line 1, and excludes the otherwise similar discovery that names line 4 of a three-line file. This demonstrates the intended handoff filter in the runner fixture; it does not remove the command-form defect above.
