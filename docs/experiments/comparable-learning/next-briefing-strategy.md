<!-- interlock: next-briefing-strategy@v0 -->

# Next briefing strategy proposal

This is a proposal for Rodrigo, not a ratification. We remain at M5: the two
matched pairs show a retained item can be delivered, scoped, and checked, not
that it improves work or compounds. The order below follows the spine from
scoped retained knowledge to better briefs and plans: first make a later
brief's response legible, then make its comparison interpretable, then repair a
separate operational defect. It preserves usable thresholds and provenance,
keeps the human-facing read a position rather than an event stream, composes
the existing brief/debrief and audit seams, dogfoods them, and defers
retrofit-friendly policy decisions.

## 1. Brief change — require a report-level response to each received item

**Observed deficiency and evidence.** The same final-line hypothesis reached
both treatment briefs (`outcome-read.md:50-61`). Review-b checked it and tied it
to a report hunk, but that does not show causation or improvement
(`:63-67`). Test-design-b's debrief said the report retained it, while the
report did not (`:68-72`; `inputs/test-pair-assessment.md:18-24`). A rooted
source link is location provenance, not semantic truth:
`packages/verifier/src/foundAt.ts:157-163` checks only the declared range, and
`packages/substrate/src/evidence.ts:98-110` carries a rooted discovery as a
hypothesis scoped by its hunk. A hunk says where support lives; it does not say
what a later task needs to know.

**Smallest intervention.** Put the same conditional clause in both authored
briefs: for each task-relevant received hypothesis, if any, record checked use
with a report hunk, justified rejection with its reason, or no use with its
task-relevance explanation. Zero hypotheses is valid; coverage-absence notices
do not each demand a ritual response. Only actual substrate context varies.
This is an authored brief/report convention, not a gate or a claim that context
must be used.

**Next check and falsification.** A source check and report hunk must make the
predeclared response independently readable. The change has no demonstrated
benefit if the report still cannot substantiate that response, or if the
control produces the same task-relevant result without the item. Rodrigo must
approve a later graph/brief; the way back is its immutable brief, report,
debrief, and receipts. Removing the clause from a future brief needs no source
or policy rollback.

## 2. Orchestration change — make the next comparison attributable enough to read

**Observed deficiency and evidence.** Work was sequential with one journal
writer and partly or wholly visible conditions (`outcome-read.md:20-29`), and
test-design-b's broad search exposed old and sibling brief content
(`inputs/final-read-audit.md:15-21`). The audit does not show that this caused
the weak report, but it prevents clean attribution. Prompt-to-settled time,
brief/report byte counts, gate counts, and a rooted quotation have no quality
direction (`outcome-read.md:151-163`).

**Smallest intervention.** Before a later pair starts, Rodrigo's experiment
brief fixes the two task bodies, input set, order/counterbalancing choice, and
the report-level response above. Keep the assessor's condition hidden where
practical and retain a read audit that names any extra visible content. This is
operating practice using the current artifacts, not a new framework or gate.

**Next check and falsification.** Interpret the pair as clean only if the audit
records no material extra content and the assessment can identify each
predeclared response without condition labels. Always read and retain a
qualified or negative observation; if either condition fails, it is not
evidence of benefit. Rodrigo authorizes the new comparison; the frozen inputs,
audit, and commits retain the way back.

## 3. Product defect — separate review-grace timing from learning transfer

**Observed deficiency and evidence.** The citation release armed grace from a
pre-wait timestamp: an advertised 300 seconds lasted about 83 seconds; manual
judgment later earned fresh proof (`inputs/comparison-index.md:74-81`). Current
`sessionWait` arms grace only after `waitUntil` returns, using the earlier
`now` value (`packages/runner/src/sessionWait.ts:80-127`).

**Smallest intervention.** Do not change learning briefs or add a workflow
framework for it. When Rodrigo authorizes repair, give a separate product brief
one focused regression that advances the clock through the blocking wait and
proves the full post-settle grace interval. Its failure would falsify the repair;
its passing would establish timing behavior, not learning benefit. Authority is
Rodrigo's approved repair graph; the way back is the isolated diff, debrief,
and runner receipts. No automatic ratification or live-graph rewrite follows.
