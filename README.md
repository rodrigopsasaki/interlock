# Interlock

A harness for doing software work with agents: enough context that they decide and manage their own work, enough structure that you never lose control.

Named for the railway interlocking: the mechanism in a signal box that makes an unsafe signal impossible to set. Nothing proceeds without its proof, and the proof is not the driver's word.

## The practice

You could follow this with a checklist and no software. Interlock is the reference implementation.

1. **Brief in.** Every unit of work is a node in a graph: an acceptance, the nodes it depends on, and the gates that must clear before it is done. The brief is what a session is given. It is immutable once the session starts.
2. **Any hands.** Claude Code, Codex, Cursor, a person typing. Interlock does not wrap agents or replace them. It owns the structure of the work, not the terminal.
3. **Diff and debrief out.** A session returns its diff and a typed debrief: what it had to discover that the brief did not say, and what it decided, each pointing at the hunk it produced.
4. **Gate before done.** The harness runs the gates in the worktree and writes receipts. Cleared is a type that carries one receipt per declared gate. It cannot be constructed short.
5. **Drilldown on demand.** Five columns per session: brief, context, discoveries, decisions, outcome. The debrief is verified against the diff, and whatever cannot be rooted is marked, not hidden.
6. **Position, not events.** You hold a position and are told when it should change. Everything else is a receipt you can pull.

## What it composes

- [herdr](https://herdr.dev) owns terminals, processes, agent state and machines. Interlock drives it through one adapter.
- A substrate, reached by address, owns beliefs about code and supplies context to briefs. The address may be none, and everything still runs.
- [Phyxius](https://github.com/rodrigopsasaki/phyxius) is the spine: the ledger is a journal, state is a projection, recovery is replay.

## What it is not

- Not an agent, and not an orchestrator model. No LLM holds the system's state or decides what runs next.
- Not tied to a model, a runtime, or an editor. Every such assumption lives in an adapter or does not exist.
- Not a multiplexer. herdr is, and tmux is the fallback.

## Status

Nothing runs yet. This repository is seeded with the design it will be held to and with its own first graph.

- [docs/design/0001-interlock.md](docs/design/0001-interlock.md) is the design note: decisions, invariants, vocabulary, seams, and a bend log.
- [.interlock/graphs/0001-bootstrap.yaml](.interlock/graphs/0001-bootstrap.yaml) is the plan, written in interlock's own graph format by hand, because the interpreter does not exist yet. It builds interlock far enough to run that graph through itself.
- [AGENTS.md](AGENTS.md) is what anyone, human or agent, reads before working here.

The repository is public on purpose. It is a commitment made where it can be seen.

## Developed by

Rodrigo Sasaki. Licensed under Apache 2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
