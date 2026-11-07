import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { createLedger, gate, type Node, nodeKey } from "ledger";
import {
  declaredGateIds,
  explainStandingGatesRefusal,
  gateCommandTable,
  loadStandingGates,
} from "runner";
import { parseFlag, parseFlagValue } from "../flags.ts";
import type { CommandResult } from "../main.ts";

export async function runReceiptRetract(
  args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const optionIndex = args.findIndex((value) => value.startsWith("--"));
  const positional = optionIndex === -1 ? args : args.slice(0, optionIndex);
  const graph = positional[0];
  const node = positional[1];
  const gateId = positional[2];
  if (graph === undefined || (node !== undefined && gateId === undefined)) {
    return {
      exitCode: 1,
      message: "interlock receipt retract: expected a graph, or a graph, node and gate.",
    };
  }
  if (gateId !== undefined && node === undefined) {
    return {
      exitCode: 1,
      message: "interlock receipt retract: expected a node before the gate.",
    };
  }
  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return { exitCode: 1, message: "interlock receipt retract: refuses without --by." };
  }
  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return { exitCode: 1, message: "interlock receipt retract: refuses without --because." };
  }
  const delegated = parseFlagValue(args, "--for");
  if (delegated.kind !== "absent") {
    return {
      exitCode: 1,
      message:
        "interlock receipt retract: --for is not allowed; the owner retracts without delegation.",
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
  if (isErr(document)) return { exitCode: 1, message: explainGraphRefusal(document.error) };

  const targetNode: Node = node === undefined ? { graph, id: graph } : { graph, id: node };
  const declaredGates =
    node === undefined
      ? document.value.gates.map((declared) => declared.id)
      : (() => {
          const declaration = document.value.nodes.find((candidate) => candidate.id === node);
          return declaration === undefined
            ? undefined
            : declaration.gates.map((candidate) => candidate.id);
        })();
  if (declaredGates === undefined) {
    return {
      exitCode: 1,
      message: `${graphPath}: no node "${node}" declared on graph "${graph}".`,
    };
  }
  const targetGate = gateId ?? "approved";
  if (!declaredGates.includes(targetGate)) {
    return {
      exitCode: 1,
      message: `${targetNode.id}: gate "${targetGate}" is not declared; declared gates are ${declaredGates.join(", ") || "(none)"}.`,
    };
  }
  if (node !== undefined) {
    const standing = await loadStandingGates(repoRoot);
    if (isErr(standing))
      return { exitCode: 1, message: explainStandingGatesRefusal(standing.error) };
    const allGates = declaredGateIds(
      standing.value,
      document.value.nodes.find((candidate) => candidate.id === node)?.gates ?? [],
    );
    if (!allGates.includes(targetGate)) {
      return { exitCode: 1, message: `${node}: gate "${targetGate}" is not declared.` };
    }
    if (
      gateCommandTable(
        standing.value,
        document.value.nodes.find((candidate) => candidate.id === node)?.gates ?? [],
      ).get(targetGate)?.kind !== "human"
    ) {
      return {
        exitCode: 1,
        message: `${node}/${targetGate}: only a delegated human receipt can be retracted.`,
      };
    }
  }

  const journal = await sharedJournalDirectory(repoRoot);
  const opened = await createLedger({
    clock: options.clock ?? createSystemClock(),
    directory: journal,
  });
  if (isErr(opened)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${opened.error.line} has shape tag "${opened.error.tag}", which this build does not recognize.`,
    };
  }
  const ledger = opened.value;
  try {
    const current =
      ledger.projection().nodes.get(nodeKey(targetNode))?.gates.get(targetGate) ?? gate.pending();
    if (current.kind !== "satisfied") {
      return {
        exitCode: 1,
        message: `${targetNode.id}/${targetGate}: no satisfied receipt can be retracted.`,
      };
    }
    const derivation = current.receipt.derivation;
    if (derivation.kind !== "human" || !("citeKey" in derivation)) {
      return {
        exitCode: 1,
        message: `${targetNode.id}/${targetGate}: the owner's receipt is untouched.`,
      };
    }
    if (derivation.for !== by) {
      return {
        exitCode: 1,
        message: `${targetNode.id}/${targetGate}: only ${derivation.for} can retract this delegated receipt.`,
      };
    }
    ledger.append({
      kind: "receipt-retracted",
      node: targetNode,
      gate: targetGate,
      receiptId: current.receipt.id,
      by,
      because,
    });
    return {
      exitCode: 0,
      message: `${targetNode.id}/${targetGate}: retracted receipt ${current.receipt.id}.`,
    };
  } finally {
    await ledger.close();
  }
}
