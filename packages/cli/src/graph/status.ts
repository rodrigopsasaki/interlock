import { createSystemClock, type Clock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { nodeKey, readReplay, type Outcome } from "ledger";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";

const OUTCOME_KINDS: ReadonlySet<string> = new Set([
  "cleared",
  "held",
  "reset",
  "failed",
  "cancelled",
  "superseded",
]);

function isOutcomeKind(value: string): value is Outcome["kind"] {
  return OUTCOME_KINDS.has(value);
}

function stateOf(outcome: Outcome | undefined): string {
  return outcome === undefined ? "no outcome" : outcome.kind;
}

export async function runGraphStatus(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const [id] = args;
  if (id === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock graph status: expected a graph id, e.g. "interlock graph status 0001-bootstrap --expect cleared".',
    };
  }

  const expect = parseFlag(args, "--expect");
  if (expect === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock graph status: refuses without --expect; name the outcome every node must carry, e.g. "--expect cleared".',
    };
  }
  if (!isOutcomeKind(expect)) {
    return {
      exitCode: 1,
      message: `interlock graph status: "${expect}" is not an outcome kind; expected one of ${[...OUTCOME_KINDS].join(", ")}.`,
    };
  }

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const path = graphFilePath(repoRoot, id);
  const document = await loadGraphDocument(path);
  if (isErr(document)) {
    return { exitCode: 1, message: explainGraphRefusal(document.error) };
  }

  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
    };
  }
  const projection = replayed.value;

  const clock = options.clock ?? createSystemClock();
  const nowWallMs = clock.now().wallMs;

  const notReady: string[] = [];
  for (const declaration of document.value.nodes) {
    const view = projection.nodes.get(
      nodeKey({ graph: id, id: declaration.id }),
    );
    if (view?.outcome?.kind === expect) continue;

    // The node under judgement is leased by this very run while its gates execute, so a graph
    // can only ever be checked from inside itself by letting a live lease stand in for the
    // outcome it does not have yet.
    const leasedLive = [...projection.sessions.values()].some(
      (session) =>
        session.node.graph === id &&
        session.node.id === declaration.id &&
        session.lease !== undefined &&
        !session.leaseExpired &&
        session.lease.expiry > nowWallMs,
    );
    if (leasedLive) continue;

    notReady.push(`${declaration.id}: ${stateOf(view?.outcome)}`);
  }

  if (notReady.length === 0) {
    return {
      exitCode: 0,
      message: `${id}: every node is ${expect} or leased by a live session (${document.value.nodes.length} node(s)).`,
    };
  }

  return { exitCode: 1, message: notReady.join("\n") };
}
