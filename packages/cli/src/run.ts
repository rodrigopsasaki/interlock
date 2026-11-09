import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { explainRoleTableRefusal, readRoleTable } from "debrief";
import {
  approvalState,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocumentText,
  sharedJournalDirectory,
} from "face";
import { createLedger, explainScopeRefusal, fileScope, nodeKey, receiptId } from "ledger";
import {
  type BriefWriteOutcome,
  briefExists,
  briefPath,
  type DeclaredNode,
  decidedNodeRefusal,
  driveInteractiveSession,
  explainLocalConfigRefusal,
  explainMergeRuntimesRefusal,
  explainRuntimeCatalogueRefusal,
  explainRuntimeSelectionRefusal,
  explainSessionBriefRefusal,
  explainStandingGatesRefusal,
  type GateCommandRunner,
  loadLocalConfig,
  loadRuntimeCatalogue,
  loadStandingGates,
  mergeRuntimes,
  type RoleShape,
  type Runtime,
  reconcileMachineOnStart,
  resolveMachine,
  roleShapeFor,
  routeRuntime,
  unmetDependencies,
  writeBriefIntoWorktree,
} from "runner";
import { parseFlag } from "./flags.ts";
import type { CommandResult } from "./main.ts";
import { substrateClientForRepository } from "./repositoryOrigin.ts";

export async function runInterlockRun(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly commandRunner?: GateCommandRunner;
    readonly outputDirectory?: string;
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

  const machine = await resolveMachine(repoRoot);
  if (isErr(machine)) return { exitCode: 1, message: machine.error };

  const localConfig = await loadLocalConfig(repoRoot);
  if (isErr(localConfig)) {
    return {
      exitCode: 1,
      message: explainLocalConfigRefusal(localConfig.error),
    };
  }
  const substrate = await substrateClientForRepository(
    repoRoot,
    localConfig.value.substrateAddress,
    localConfig.value.substrateKeyFile,
    localConfig.value.substrateSendRepository,
  );

  const catalogue = await loadRuntimeCatalogue();
  if (isErr(catalogue)) {
    return {
      exitCode: 1,
      message: explainRuntimeCatalogueRefusal(catalogue.error),
    };
  }
  const mergedRuntimes = mergeRuntimes(catalogue.value, localConfig.value);
  if (isErr(mergedRuntimes)) {
    return {
      exitCode: 1,
      message: explainMergeRuntimesRefusal(mergedRuntimes.error),
    };
  }
  const requestedRuntime = parseFlag(args, "--runtime");

  const graphPath = graphFilePath(repoRoot, graph);
  let graphBytes: Buffer;
  try {
    graphBytes = await readFile(graphPath);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exitCode: 1, message: `${graphPath}: no such file; expected a graph@v0 document.` };
    }
    throw error;
  }
  const document = loadGraphDocumentText(graphBytes.toString("utf-8"), graphPath);
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

  let shape: RoleShape | undefined;
  if (declaration.role !== undefined) {
    const roleTable = await readRoleTable(repoRoot);
    if (isErr(roleTable)) {
      return { exitCode: 1, message: explainRoleTableRefusal(roleTable.error) };
    }
    shape = roleShapeFor(declaration.role, roleTable.value, substrate.address);
  }

  if (!briefExists(repoRoot, graph, node)) {
    return {
      exitCode: 1,
      message: `${briefPath(repoRoot, graph, node)}: no brief; brief authoring is not the runner's, so this node cannot be leased yet.`,
    };
  }

  const journal = await sharedJournalDirectory(repoRoot);
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
    const agentRuntime = await routeRuntime(
      mergedRuntimes.value,
      requestedRuntime,
      ledger.projection(),
      localConfig.value,
    );
    if (isErr(agentRuntime)) {
      return {
        exitCode: 1,
        message: explainRuntimeSelectionRefusal(agentRuntime.error),
      };
    }
    const recovered = await reconcileMachineOnStart(
      ledger,
      clock,
      narrate,
      options.runtime,
      agentRuntime.value.kind !== "exec",
    );
    if (isErr(recovered)) return { exitCode: 1, message: recovered.error };
    const contentHash = await receiptId(
      repoRoot,
      fileScope([relative(repoRoot, graphPath)]),
      "approved",
    );
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

    const decided = decidedNodeRefusal(graph, node, ledger.projection());
    if (decided !== undefined) return { exitCode: 1, message: decided };

    const unmet = unmetDependencies(graph, declaration.dependsOn, ledger.projection());
    if (unmet.length > 0) {
      return {
        exitCode: 1,
        message: `${node}: dependencies not cleared: ${unmet.join(", ")}.`,
      };
    }

    const declared: DeclaredNode = {
      acceptance: declaration.acceptance ?? "",
      gates: declaration.gates,
    };

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
        declared,
        substrate,
        shape,
      );
      return isErr(written) ? err(explainSessionBriefRefusal(written.error)) : ok(written.value);
    };

    return await driveInteractiveSession({
      machine: machine.value,
      repoRoot,
      graph,
      node,
      role: shape?.role ?? "worker",
      ...(shape === undefined ? {} : { shape }),
      acceptance: declared.acceptance,
      nodeGates: declared.gates,
      authoritativeGraphPath: graphPath,
      parsedGraphHash: createHash("sha256").update(graphBytes).digest("hex"),
      ...(declaration.paths === undefined ? {} : { paths: declaration.paths }),
      localConfig: localConfig.value,
      agentRuntime: agentRuntime.value,
      standingGates: standingGates.value,
      substrate,
      ledger,
      clock,
      narrate,
      ...(options.commandRunner === undefined ? {} : { commandRunner: options.commandRunner }),
      ...(options.outputDirectory === undefined
        ? {}
        : { outputDirectory: options.outputDirectory }),
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
      runnerIdPrefix: "run",
      composeBrief,
    });
  } finally {
    await ledger.close();
  }
}
