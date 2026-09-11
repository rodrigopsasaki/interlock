import { createSystemClock, type Clock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import {
  createLedger,
  gate,
  nodeKey,
  proposeGateMove,
  type Node,
} from "ledger";
import {
  declaredGateIds,
  explainStandingGatesRefusal,
  loadStandingGates,
} from "runner";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";

export async function runGateWaive(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const [graph, node, gateId] = args;
  if (graph === undefined || node === undefined || gateId === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock gate waive: expected a graph id, a node id and a gate id, e.g. "interlock gate waive 0001-bootstrap verbs typecheck --by <who> --because <why>".',
    };
  }

  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return {
      exitCode: 1,
      message:
        "interlock gate waive: refuses without --because; every waiver records why.",
    };
  }

  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return {
      exitCode: 1,
      message:
        "interlock gate waive: refuses without --by; every waiver records who.",
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

  const declaration = document.value.nodes.find(
    (candidate) => candidate.id === node,
  );
  if (declaration === undefined) {
    return {
      exitCode: 1,
      message: `${graphPath}: no node "${node}" declared on graph "${graph}".`,
    };
  }

  const standingGates = await loadStandingGates(repoRoot);
  if (isErr(standingGates)) {
    return {
      exitCode: 1,
      message: explainStandingGatesRefusal(standingGates.error),
    };
  }
  const declaredGates = declaredGateIds(standingGates.value, declaration.gates);
  if (!declaredGates.includes(gateId)) {
    return {
      exitCode: 1,
      message: `${node}: gate "${gateId}" is not declared; declared gates are ${declaredGates.join(", ") || "(none)"}.`,
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
    const current = view?.gates.get(gateId) ?? gate.pending();

    const latestReceipt = [...(view?.receipts ?? [])]
      .reverse()
      .find((receipt) => receipt.gate === gateId);
    if (latestReceipt === undefined) {
      return {
        exitCode: 1,
        message: `${node}/${gateId}: no receipt to waive; a waiver needs something to waive.`,
      };
    }

    const moved = proposeGateMove(
      declaredGates,
      gateId,
      current,
      gate.waived(by, because, latestReceipt),
    );
    if (isErr(moved)) {
      const refusal = moved.error;
      const message =
        refusal.kind === "undeclared-gate"
          ? `${node}: gate "${gateId}" is not declared; declared gates are ${refusal.declared.join(", ") || "(none)"}.`
          : `${node}/${gateId}: cannot move from ${refusal.from}, which is terminal.`;
      return { exitCode: 1, message };
    }

    ledger.append({
      kind: "gate-moved",
      node: targetNode,
      gate: gateId,
      to: moved.value,
    });
    return {
      exitCode: 0,
      message: `${node}/${gateId}: waived by ${by} (receipt ${latestReceipt.id}).`,
    };
  } finally {
    await ledger.close();
  }
}
