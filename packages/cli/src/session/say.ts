import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import { findRepoRoot, openQuestionOf, sharedJournalDirectory } from "face";
import {
  createLedger,
  derivation,
  type Ledger,
  leaseIsLive,
  type PersonSaid,
  personSaid,
  retainOutboxArtifact,
  type SessionView,
} from "ledger";
import {
  type Agent,
  createHerdrRuntime,
  explainRuntimeRefusal,
  GATE_DERIVATION_VERSION,
  type Runtime,
} from "runner";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";

const VALUED_FLAGS: ReadonlySet<string> = new Set(["--by", "--because"]);
const SAY_RUNNER = "interlock session say";

type PaneAgent =
  | { readonly kind: "found"; readonly runtime: Runtime; readonly agent: Agent }
  | { readonly kind: "lost"; readonly because: string };

function positionalOf(args: readonly string[]): readonly string[] {
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (VALUED_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

function refused(message: string): CommandResult {
  return { exitCode: 1, message };
}

function liveAttemptOf(
  sessions: Iterable<SessionView>,
  graph: string,
  node: string,
  nowWallMs: number,
): SessionView | undefined {
  return [...sessions]
    .filter(
      (session) =>
        session.node.graph === graph && session.node.id === node && leaseIsLive(session, nowWallMs),
    )
    .at(-1);
}

async function paneAgentOf(
  injected: Runtime | undefined,
  graph: string,
  node: string,
  session: string,
): Promise<PaneAgent> {
  const created = injected === undefined ? await createHerdrRuntime() : ok(injected);
  if (isErr(created)) return { kind: "lost", because: explainRuntimeRefusal(created.error) };
  const runtime = created.value;
  if (runtime.resolveAgent === undefined) {
    return {
      kind: "lost",
      because: "this multiplexer cannot find a session's agent by its identity",
    };
  }
  const resolved = await runtime.resolveAgent({ graph, node, session });
  if (isErr(resolved)) return { kind: "lost", because: explainRuntimeRefusal(resolved.error) };
  return resolved.value === undefined
    ? { kind: "lost", because: `no pane reports session ${session}` }
    : { kind: "found", runtime, agent: resolved.value };
}

function outboxDerivation() {
  return derivation.gate("outbox", GATE_DERIVATION_VERSION, SAY_RUNNER);
}

function acknowledge(
  ledger: Ledger,
  said: PersonSaid,
  session: string,
  agent: Agent,
): string | undefined {
  const acknowledgment = retainOutboxArtifact(
    ledger.directory(),
    "acknowledgment",
    Buffer.from(JSON.stringify({ said: said.id, session, agent: agent.id, pane: agent.pane.id })),
  );
  if (isErr(acknowledgment)) {
    return "the pane took the words but the acknowledgment could not be retained";
  }
  const recorded = ledger.appendConfirmed({
    kind: "outbox-delivery-recorded",
    delivery: {
      id: said.id,
      state: "acknowledged",
      because: "the multiplexer took the words as a prompt",
      derivation: outboxDerivation(),
      acknowledgment: acknowledgment.value,
    },
  });
  return isErr(recorded)
    ? "the pane took the words but their delivery could not be recorded"
    : undefined;
}

function recordUncertain(ledger: Ledger, said: PersonSaid, because: string): void {
  ledger.appendConfirmed({
    kind: "outbox-delivery-recorded",
    delivery: { id: said.id, state: "uncertain", because, derivation: outboxDerivation() },
  });
}

export async function runSessionSay(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock; readonly runtime?: Runtime } = {},
): Promise<CommandResult> {
  const [graph, node, text] = positionalOf(args);
  if (graph === undefined || node === undefined || text === undefined) {
    return refused(
      'interlock session say: expected a graph id, a node id and the words to say, e.g. "interlock session say 0046-loom-feed say-into-pane "build on main" --by <who>".',
    );
  }

  const by = parseFlag(args, "--by");
  if (by === undefined || by.length === 0) {
    return refused(
      "interlock session say: refuses without --by; every word put into a pane records who said it.",
    );
  }
  const because = parseFlag(args, "--because");

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return refused(
      `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    );
  }

  const journal = await sharedJournalDirectory(repoRoot);
  const clock = options.clock ?? createSystemClock();
  const opened = await createLedger({ clock, directory: journal });
  if (isErr(opened)) {
    return refused(
      `${journal}: line ${opened.error.line} has shape tag "${opened.error.tag}", which this build does not recognize.`,
    );
  }
  const ledger = opened.value;

  try {
    const nowWallMs = clock.now().wallMs;
    const attempt = liveAttemptOf(ledger.projection().sessions.values(), graph, node, nowWallMs);
    if (attempt === undefined) {
      return refused(
        `${graph}/${node}: no live attempt to say it to; nothing was said or recorded.`,
      );
    }

    const pane = await paneAgentOf(options.runtime, graph, node, attempt.session);
    if (pane.kind === "lost") {
      return refused(
        `${graph}/${node}: the pane for session ${attempt.session} can't be found (${pane.because}); nothing was said or recorded.`,
      );
    }

    const question = openQuestionOf(attempt.notes, attempt.said);
    const said = personSaid({
      session: attempt.session,
      by,
      text,
      at: nowWallMs,
      ...(question === undefined ? {} : { answers: question }),
      ...(because === undefined ? {} : { because }),
    });
    if (isErr(ledger.appendConfirmed({ kind: "person-said", session: attempt.session, said }))) {
      return refused(
        `${graph}/${node}: ${by}'s words could not be recorded, so they were not delivered.`,
      );
    }

    const delivered = await pane.runtime.prompt(pane.agent, text);
    const doubt = isErr(delivered)
      ? explainRuntimeRefusal(delivered.error)
      : acknowledge(ledger, said, attempt.session, pane.agent);
    const answering = question === undefined ? "" : `, answering its question at ${question.at}`;
    if (doubt === undefined) {
      return {
        exitCode: 0,
        message: `${graph}/${node}: ${by}'s words reached session ${attempt.session}${answering}.`,
      };
    }
    recordUncertain(ledger, said, doubt);
    const stillOpen = question === undefined ? "" : "; the question stays open";
    return refused(
      `${graph}/${node}: ${by}'s words were recorded but their delivery is uncertain (${doubt})${stillOpen}.`,
    );
  } finally {
    await ledger.close();
  }
}
