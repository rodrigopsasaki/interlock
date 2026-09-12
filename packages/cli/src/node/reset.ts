import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { createLedger, type Node, nodeKey, outcome, proposeOutcomeMove } from "ledger";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

export async function runNodeReset(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock node reset: expected a graph id and a node id, e.g. "interlock node reset 0001-bootstrap verbs --by <who> --because <why>".',
    };
  }

  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return {
      exitCode: 1,
      message: "interlock node reset: refuses without --because; every reset records why.",
    };
  }

  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return {
      exitCode: 1,
      message: "interlock node reset: refuses without --by; every reset records who.",
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

  const graphPath = graphFilePath(repoRoot, graph);
  const document = await loadGraphDocument(graphPath);
  if (isErr(document)) {
    return { exitCode: 1, message: explainGraphRefusal(document.error) };
  }

  const declaration = document.value.nodes.find((candidate) => candidate.id === node);
  if (declaration === undefined) {
    return {
      exitCode: 1,
      message: `${graphPath}: no node "${node}" declared on graph "${graph}".`,
    };
  }

  const journal = sharedJournalDirectory(repoRoot);
  const clock = options.clock ?? createSystemClock();
  const opened = await createLedger({ clock, directory: journal });
  if (isErr(opened)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${opened.error.line} has shape tag "${opened.error.tag}", which this build does not recognize.`,
    };
  }
  const ledger = opened.value;

  try {
    const targetNode: Node = { graph, id: node };
    const nowWallMs = clock.now().wallMs;
    const liveLease = [...ledger.projection().sessions.values()].find(
      (session) =>
        session.node.graph === graph &&
        session.node.id === node &&
        session.lease !== undefined &&
        !session.leaseExpired &&
        session.lease.expiry > nowWallMs,
    );
    if (liveLease?.lease !== undefined) {
      return {
        exitCode: 1,
        message: `${node} is leased by session ${liveLease.session} until ${isoOf(liveLease.lease.expiry)}; wait for it or run interlock sweep.`,
      };
    }

    const view = ledger.projection().nodes.get(nodeKey(targetNode));
    if (view?.outcome === undefined) {
      return {
        exitCode: 1,
        message: `${node}: has no outcome yet; nothing to reset.`,
      };
    }

    const next = outcome.reset(view.receipts, by, because);
    const moved = proposeOutcomeMove(view.outcome, next);
    if (isErr(moved)) {
      return {
        exitCode: 1,
        message: `${node}: outcome cannot move from ${moved.error.from}, which is terminal.`,
      };
    }

    ledger.append({
      kind: "outcome-set",
      node: targetNode,
      outcome: moved.value,
    });
    return { exitCode: 0, message: `${node}: reset by ${by}.` };
  } finally {
    await ledger.close();
  }
}
