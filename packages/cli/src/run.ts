import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { createSystemClock, type Clock } from "@phyxiusjs/clock";
import { isErr, ok } from "@phyxiusjs/fp";
import {
  approvalState,
  currentCommitSha,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import {
  createLedger,
  explainScopeRefusal,
  nodeKey,
  receiptId,
  type Gate,
} from "ledger";
import {
  briefExists,
  briefPath,
  buildBrief,
  createHerdrRuntime,
  createNodeWorktree,
  declaredGateIds,
  explainGateJudgeRefusal,
  explainLocalConfigRefusal,
  explainRuntimeRefusal,
  explainStandingGatesRefusal,
  explainWorktreeRefusal,
  gateCommandTable,
  gitTrackedFiles,
  judgeGates,
  loadLocalConfig,
  loadStandingGates,
  takeLease,
  type Agent,
  type Pane,
  type Runtime,
} from "runner";
import type { CommandResult } from "./main.ts";

const HELD_REVISIT_MS = 24 * 60 * 60 * 1000;

function approvalReceiptSha(current: Gate | undefined): string | undefined {
  if (current === undefined) return undefined;
  if (current.kind === "satisfied" || current.kind === "waived") {
    return current.receipt.commitSha;
  }
  return undefined;
}

export async function runInterlockRun(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly runtime?: Runtime;
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
  let pane: Pane | undefined;
  let agent: Agent | undefined;
  let runtime: Runtime | undefined;

  try {
    const contentHash = await receiptId(
      repoRoot,
      [relative(repoRoot, graphPath)],
      "approved",
    );
    if (isErr(contentHash)) {
      return { exitCode: 1, message: explainScopeRefusal(contentHash.error) };
    }
    const graphNode = { graph, id: graph };
    const approvalGate = ledger
      .projection()
      .nodes.get(nodeKey(graphNode))
      ?.gates.get("approved");
    const approval = approvalState(approvalGate, contentHash.value);
    if (approval !== "approved") {
      return {
        exitCode: 1,
        message: `${graph}: graph is ${approval}, not approved for its current content; refusing to lease "${node}".`,
      };
    }

    const graphBaseSha = approvalReceiptSha(approvalGate);
    if (graphBaseSha === undefined) {
      return {
        exitCode: 1,
        message: `${graph}: approval gate carries no receipt to read a base SHA from.`,
      };
    }

    const targetNode = { graph, id: node };
    const unmet = declaration.dependsOn.filter(
      (dependsOn) =>
        ledger.projection().nodes.get(nodeKey({ graph, id: dependsOn }))
          ?.outcome?.kind !== "cleared",
    );
    if (unmet.length > 0) {
      return {
        exitCode: 1,
        message: `${node}: dependencies not cleared: ${unmet.join(", ")}.`,
      };
    }

    const gateIds = declaredGateIds(standingGates.value, declaration.gates);
    const sessionId = randomUUID();
    const brief = buildBrief(
      graph,
      node,
      declaration.acceptance ?? "",
      gateIds,
      gitTrackedFiles(repoRoot),
    );
    ledger.append({
      kind: "session-started",
      session: { id: sessionId, node: targetNode },
      brief,
    });

    const lease = takeLease(
      ledger,
      clock,
      targetNode,
      sessionId,
      localConfig.value.leaseMs,
    );

    const worktreePath = join(repoRoot, localConfig.value.worktreeRoot, node);
    const branch = `graph/${graph}/${node}`;
    const worktree = createNodeWorktree(
      repoRoot,
      worktreePath,
      graphBaseSha,
      branch,
    );
    if (isErr(worktree)) {
      lease.stop();
      return { exitCode: 1, message: explainWorktreeRefusal(worktree.error) };
    }

    const injectedRuntime = options.runtime;
    const createdRuntime =
      injectedRuntime === undefined
        ? await createHerdrRuntime()
        : ok(injectedRuntime);
    if (isErr(createdRuntime)) {
      lease.stop();
      return {
        exitCode: 1,
        message: explainRuntimeRefusal(createdRuntime.error),
      };
    }
    runtime = createdRuntime.value;

    const openedPane = await runtime.openPane(worktreePath);
    if (isErr(openedPane)) {
      lease.stop();
      return { exitCode: 1, message: explainRuntimeRefusal(openedPane.error) };
    }
    pane = openedPane.value;

    const startedAgent = await runtime.startAgent(
      pane,
      localConfig.value.runtime.kind,
      localConfig.value.runtime.args,
    );
    if (isErr(startedAgent)) {
      lease.stop();
      return {
        exitCode: 1,
        message: explainRuntimeRefusal(startedAgent.error),
      };
    }
    agent = startedAgent.value;

    const reported = await runtime.reportIdentity(
      agent,
      `${graph}/${node}/${sessionId}`,
      {
        sessionId,
      },
    );
    if (isErr(reported)) {
      lease.stop();
      return { exitCode: 1, message: explainRuntimeRefusal(reported.error) };
    }

    const waited = await runtime.waitUntil(
      agent,
      ["idle", "blocked", "done"],
      localConfig.value.runTimeoutMs,
    );
    lease.stop();
    if (isErr(waited)) {
      return { exitCode: 1, message: explainRuntimeRefusal(waited.error) };
    }

    const debriefedSha = currentCommitSha(worktreePath);
    const judged = await judgeGates({
      ledger,
      clock,
      node: targetNode,
      declaredGateIds: gateIds,
      commandFor: gateCommandTable(standingGates.value, declaration.gates),
      worktree: worktreePath,
      scopeRoot: worktreePath,
      scopePaths: gitTrackedFiles(worktreePath),
      commitSha: debriefedSha,
      runnerId: `run-${sessionId}`,
      holdMs: HELD_REVISIT_MS,
    });
    if (isErr(judged)) {
      return { exitCode: 1, message: explainGateJudgeRefusal(judged.error) };
    }

    return {
      exitCode: 0,
      message: `${node}: ${judged.value.kind} (session ${sessionId}, agent status ${waited.value}).`,
    };
  } finally {
    if (pane !== undefined && runtime !== undefined)
      await runtime.closePane(pane);
    await ledger.close();
  }
}
