import { relative } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  approvalState,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { createLedger, explainScopeRefusal, nodeKey, receiptId } from "ledger";
import {
  type BriefWriteOutcome,
  briefExists,
  briefPath,
  driveInteractiveSession,
  explainLocalConfigRefusal,
  explainSessionBriefRefusal,
  explainStandingGatesRefusal,
  loadLocalConfig,
  loadStandingGates,
  type Runtime,
  unmetDependencies,
  writeBriefIntoWorktree,
} from "runner";
import { substrateClientFor } from "substrate";
import type { CommandResult } from "./main.ts";

export async function runInterlockRun(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly runtime?: Runtime;
    readonly narrate?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock run: expected a graph id and a node id, e.g. "interlock run 0001-bootstrap runner-command-gate".',
    };
  }

  const narrate =
    options.narrate ??
    ((line: string) => {
      process.stdout.write(`${line}\n`);
    });

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const localConfig = await loadLocalConfig(repoRoot);
  if (isErr(localConfig)) {
    return {
      exitCode: 1,
      message: explainLocalConfigRefusal(localConfig.error),
    };
  }
  const substrate = substrateClientFor(
    localConfig.value.substrateAddress,
    localConfig.value.substrateKeyFile,
  );

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

  if (!briefExists(repoRoot, graph, node)) {
    return {
      exitCode: 1,
      message: `${briefPath(repoRoot, graph, node)}: no brief; brief authoring is not the runner's, so this node cannot be leased yet.`,
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
    const contentHash = await receiptId(repoRoot, [relative(repoRoot, graphPath)], "approved");
    if (isErr(contentHash)) {
      return { exitCode: 1, message: explainScopeRefusal(contentHash.error) };
    }
    const graphNode = { graph, id: graph };
    const approvalGate = ledger.projection().nodes.get(nodeKey(graphNode))?.gates.get("approved");
    const approval = approvalState(approvalGate, contentHash.value);
    if (approval !== "approved") {
      return {
        exitCode: 1,
        message: `${graph}: graph is ${approval}, not approved for its current content; refusing to lease "${node}".`,
      };
    }

    const unmet = unmetDependencies(graph, declaration.dependsOn, ledger.projection());
    if (unmet.length > 0) {
      return {
        exitCode: 1,
        message: `${node}: dependencies not cleared: ${unmet.join(", ")}.`,
      };
    }

    const composeBrief = async (
      worktreePath: string,
      graphBaseSha: string,
      session: string,
    ): Promise<Result<BriefWriteOutcome, string>> => {
      const written = await writeBriefIntoWorktree(
        repoRoot,
        worktreePath,
        graph,
        node,
        graphBaseSha,
        session,
        standingGates.value,
        declaration.gates,
        substrate,
      );
      return isErr(written) ? err(explainSessionBriefRefusal(written.error)) : ok(written.value);
    };

    return await driveInteractiveSession({
      repoRoot,
      graph,
      node,
      role: "worker",
      acceptance: declaration.acceptance ?? "",
      nodeGates: declaration.gates,
      localConfig: localConfig.value,
      standingGates: standingGates.value,
      substrate,
      ledger,
      clock,
      narrate,
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
      runnerIdPrefix: "run",
      composeBrief,
    });
  } finally {
    await ledger.close();
  }
}
