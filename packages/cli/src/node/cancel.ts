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

export async function runNodeCancel(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock node cancel: expected a graph id and a node id, e.g. "interlock node cancel 0001-bootstrap verbs --by <who> --because <why>".',
    };
  }

  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return {
      exitCode: 1,
      message: "interlock node cancel: refuses without --because; every cancellation records why.",
    };
  }

  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return {
      exitCode: 1,
      message: "interlock node cancel: refuses without --by; every cancellation records who.",
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
    const view = ledger.projection().nodes.get(nodeKey(targetNode));
    const next = outcome.cancelled(view?.receipts ?? [], by, because);
    const moved = proposeOutcomeMove(view?.outcome, next);
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
    return { exitCode: 0, message: `${node}: cancelled by ${by}.` };
  } finally {
    await ledger.close();
  }
}
