---
interlock: brief@v1
graph: 0028-current-handoff
node: record-current-handoff
role: worker
gates: []
scope: []
context_scope:
  - packages/runner/src/gateJudge.ts
  - packages/ledger/src/projection.ts
  - packages/cli/src/evidence.ts
substrate:
  address: none
---

# The position must follow the correction that was judged

Read AGENTS.md, design note and graph acceptance. Inspect ingestDebrief: its
ever-ingested check prevents a corrected selected debrief from reaching the
projection, although absorbDebrief independently rereads current disk bytes.
The retained0025 case exposes this via public evidence after successful revise
and rejudge. Fix that narrow filing seam, preserving append-only history and
ordinary behavior. Do not alter old session files or repair them yourself.

Use real discriminating runner/CLI tests, two sessions, raw-event counts and
unchanged reruns. Read existing helpers before inventing a comparison/parser.
No dependency/package changes, new agents, push, merge, gate waiver, timeout
change, permission change, direct substrate calls or old-session mutations.
Run suites sequentially; mise exec -- pnpm. If generated setup breaks, report
it without moving/copying/symlinking package trees. Finish honestly.

Actual date -u for notes. Full git rev-parse output for hashes; never expand
an abbreviation by guessing. The generated initial brief is NOT the earlier
authored template: do not use diff-filter=A. Its first session-specific Git
transition and frontmatter session/base identify it. Derivation kind agent,
runtime codex, model gpt-5.6-terra. Commit code before taking head_sha. Check
own v2 validity and corpus/reference freshness after artifacts exist. Preserve
any authored mistake through supported revision or retain a separate candidate
and report the refusal. Commit cleanly and stop; never wait for review. Root
will send no active-work feedback after a debrief is committed.
