---
interlock: brief@v1
graph: 0045-session-facts
node: codex-session-reader
role: worker
gates: []
scope: []
substrate:
  address: none
---

Implement the acceptance of node `codex-session-reader` in `.interlock/graphs/0045-session-facts.yaml` exactly as
written; the graph's `ask` and `read` carry the field evidence and the direction. Read AGENTS.md
first (axioms, invariants I1-I10, the closed vocabulary) and consume the session-facts contract that
node session-facts-seam defined in packages/ledger/src/sessionFacts.ts and the SessionFactsReader seam
in packages/runner/src/runtime.ts. Use that contract as it stands on this branch; do not redefine it.

Verified on this machine (2026-09-25): herdr's `herdr agent list` reports each Codex pane's
`agent_session` as {"source":"herdr:codex","kind":"id","value":"<uuid>"}; the record is
`~/.codex/sessions/YYYY/MM/DD/rollout-<local timestamp>-<uuid>.jsonl`, one JSON object per line with
`timestamp`, `type` and `payload`. The file does not exist until Codex receives its first prompt: in the
field failure no record existed for five minutes while the pane idled, and it appeared with the first
user message when the prompt was re-sent. User input is `type: "response_item"` with `payload.role:
"user"` and `payload.content` an array of `{type:"input_text",text}`; the first user item can be
Codex's own AGENTS.md preamble, so match the opening prompt by its text, not by position. Usage is
`type: "event_msg"` with `payload.type: "token_count"` and `payload.info.total_token_usage`
{input_tokens, cached_input_tokens, cache_write_input_tokens, output_tokens, reasoning_output_tokens,
total_tokens}; the latest such record is cumulative. Quota is `payload.rate_limits` on the same record:
{primary: {used_percent, window_minutes, resets_at}, secondary, credits, ...}; any field may be null.
Last activity is the latest line's `timestamp`. Verify each of these against a real rollout on this
machine before relying on it, and record any difference as a surprise.

Fixtures are committed and synthetic: construct minimal records in the vendor's real shape, with no
real prompts, repository content, credentials or account identifiers. Strict TypeScript: no `as`, no
`any`, no non-null operators. Vendor knowledge only inside its adapter (I6). Preserve every
historical artifact and fixture. Keep scratch under the package's `test/.runs/`, never /tmp, removed
with plain rm, never rm -rf. Run through `mise exec --` and run the full `pnpm test` before handoff,
not only this node's gate. Commit with Conventional Commits whose subjects state why. No push, no
merge. Append typed notes for every choice and surprise; file the debrief as your final commit, then
stop and wait.
