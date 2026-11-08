import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  currentCommitSha,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import {
  createLedger,
  createReceipt,
  derivation,
  duration,
  explainScopeRefusal,
  gate,
  type Node,
  nodeKey,
  proposeGateMove,
  spend,
} from "ledger";
import {
  declaredGateIds,
  explainStandingGatesRefusal,
  gateCommandTable,
  gitScope,
  loadStandingGates,
} from "runner";
import {
  contentHash,
  type DelegationOptions,
  delegatedDerivation,
  delegatedReceipt,
  type VerifiedCitation,
  verifyCitation,
} from "../delegation.ts";
import { parseFlag, parseFlagValue } from "../flags.ts";
import { pauseAfterDelegationCheck, withDelegationLock } from "../delegationLock.ts";
import type { CommandResult } from "../main.ts";

function missingDelegationValue(flag: string): CommandResult {
  return {
    exitCode: 1,
    message: `interlock gate clear: ${flag} must carry a value when present.`,
  };
}

export async function runGateClear(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly gitHost?: DelegationOptions["gitHost"];
    readonly machinePath?: string;
  } = {},
): Promise<CommandResult> {
  const [graph, node, gateId] = args;
  if (graph === undefined || node === undefined || gateId === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock gate clear: expected a graph id, a node id and a gate id, e.g. "interlock gate clear 0003-translator first-address witnessed --by <who> --because <why>".',
    };
  }

  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return {
      exitCode: 1,
      message: "interlock gate clear: refuses without --because; every clearance records why.",
    };
  }

  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return {
      exitCode: 1,
      message: "interlock gate clear: refuses without --by; every clearance records who.",
    };
  }

  const forFlag = parseFlagValue(args, "--for");
  const citesFlag = parseFlagValue(args, "--cites");
  const readingFlag = parseFlagValue(args, "--reading");
  if (forFlag.kind === "invalid") return missingDelegationValue("--for");
  if (citesFlag.kind === "invalid") return missingDelegationValue("--cites");
  if (readingFlag.kind === "invalid") return missingDelegationValue("--reading");
  if (forFlag.kind === "absent" && citesFlag.kind !== "absent") {
    return { exitCode: 1, message: "interlock gate clear: --cites requires --for." };
  }
  if (forFlag.kind === "value" && citesFlag.kind === "absent") {
    return { exitCode: 1, message: "interlock gate clear: --for requires --cites." };
  }
  if (forFlag.kind === "value" && readingFlag.kind !== "value") {
    return { exitCode: 1, message: "interlock gate clear: --for requires --reading." };
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

  const commandFor = gateCommandTable(standingGates.value, declaration.gates);
  if (commandFor.get(gateId)?.kind !== "human") {
    return {
      exitCode: 1,
      message: `${node}/${gateId}: not a human gate; a command gate is met by its command, never by hand.`,
    };
  }

  let verified: VerifiedCitation | undefined;
  let hash: string | undefined;
  if (forFlag.kind === "value" && citesFlag.kind === "value" && readingFlag.kind === "value") {
    const checked = await verifyCitation(repoRoot, forFlag.value, by, citesFlag.value, "clear", {
      ...(options.gitHost === undefined ? {} : { gitHost: options.gitHost }),
      ...(options.machinePath === undefined ? {} : { machinePath: options.machinePath }),
    });
    if (isErr(checked)) return { exitCode: 1, message: checked.error };
    verified = checked.value;
    hash = await contentHash(graphPath);
  }

  const journal = await sharedJournalDirectory(repoRoot);
  return withDelegationLock(journal, async () => {
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
    if (verified !== undefined && hash !== undefined) {
      const used = delegatedReceipt(ledger.projection(), verified.key);
      if (used !== undefined) {
        return {
          exitCode: 1,
          message: `interlock gate clear: this cite already authorized ${used.action} for ${used.target.graph}${used.target.node === undefined ? "" : `/${used.target.node}`}${used.target.gate === undefined ? "" : `/${used.target.gate}`}.`,
        };
      }
      await pauseAfterDelegationCheck();
    }
    const current =
      ledger.projection().nodes.get(nodeKey(targetNode))?.gates.get(gateId) ?? gate.pending();
    if (current.kind === "satisfied" || current.kind === "waived") {
      const staleDelegated =
        hash !== undefined &&
        current.kind === "satisfied" &&
        current.receipt.derivation.kind === "human" &&
        "contentHash" in current.receipt.derivation &&
        current.receipt.derivation.contentHash !== hash;
      if (!staleDelegated) {
        return {
          exitCode: 1,
          message: `${node}/${gateId}: cannot move from ${current.kind}, which is terminal.`,
        };
      }
    }

    const commitSha = await currentCommitSha(repoRoot);
    const receiptDerivation =
      verified === undefined ||
      hash === undefined ||
      forFlag.kind !== "value" ||
      readingFlag.kind !== "value"
        ? derivation.human(by)
        : delegatedDerivation(
            by,
            forFlag.value,
            verified,
            readingFlag.value,
            "clear",
            { graph, node, gate: gateId },
            hash,
          );
    const receipt = await createReceipt(
      repoRoot,
      gitScope(repoRoot),
      gateId,
      commitSha,
      spend.none(),
      duration.unknown(),
      receiptDerivation,
      { because },
    );
    if (isErr(receipt)) {
      return { exitCode: 1, message: explainScopeRefusal(receipt.error) };
    }

    const moved = proposeGateMove(declaredGates, gateId, current, gate.satisfied(receipt.value));
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
      message: `${node}/${gateId}: cleared by ${by} (receipt ${receipt.value.id}).`,
    };
    } finally {
      await ledger.close();
    }
  });
}
