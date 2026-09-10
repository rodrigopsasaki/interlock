import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import {
  createSystemClock,
  deadlineFrom,
  ms,
  type Clock,
} from "@phyxiusjs/clock";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
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
  heldOn,
  nodeKey,
  outcome,
  receiptId,
} from "ledger";
import {
  briefExists,
  briefPath,
  buildBrief,
  buildOpeningPrompt,
  commitBriefIfChanged,
  createHerdrRuntime,
  ensureNodeWorktree,
  declaredGateIds,
  explainGateJudgeRefusal,
  explainLocalConfigRefusal,
  explainRuntimeRefusal,
  explainSessionBriefRefusal,
  explainStandingGatesRefusal,
  explainWorktreeRefusal,
  explainWorktreeSetupRefusal,
  gateCommandTable,
  gitTrackedFiles,
  judgeGates,
  lastNonEmptyLine,
  loadLocalConfig,
  loadStandingGates,
  matchesScreen,
  runSetupCommand,
  takeLease,
  uncommittedPaths,
  unmetDependencies,
  waitForSession,
  writeBriefIntoWorktree,
  writeScreenSnapshot,
  type Agent,
  type Pane,
  type PriorWork,
  type Runtime,
  type WorktreeOutcome,
} from "runner";
import type { CommandResult } from "./main.ts";

const HELD_REVISIT_MS = 24 * 60 * 60 * 1000;

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

// undefined for a fresh worktree, or a reused one with nothing left over from a prior session.
function priorWorkOf(worktree: WorktreeOutcome): PriorWork | undefined {
  if (worktree.kind !== "reused") return undefined;
  if (worktree.uncommittedPaths === 0 && worktree.commitsBeyondBase === 0) {
    return undefined;
  }
  return {
    uncommittedPaths: worktree.uncommittedPaths,
    commitsBeyondBase: worktree.commitsBeyondBase,
  };
}

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
  // Before the prompt is taken, an unattended pane is the runner's to close on any refusal.
  // Once a person may be looking at it, it stays open on anything short of the node clearing.
  let paneCustody: "runner" | "person" = "runner";

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

    const graphBaseSha = currentCommitSha(repoRoot);

    const targetNode = { graph, id: node };
    const unmet = unmetDependencies(
      graph,
      declaration.dependsOn,
      ledger.projection(),
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
      graphBaseSha,
    });

    const lease = takeLease(
      ledger,
      clock,
      targetNode,
      sessionId,
      localConfig.value.leaseMs,
    );
    narrate(
      `leased ${node} (session ${sessionId}, expires ${isoOf(lease.expiry)})`,
    );

    const refuse = (step: string, explanation: string): CommandResult => {
      const line = `${step} refused: ${explanation}`;
      narrate(line);
      return { exitCode: 1, message: line };
    };
    const abandonLease = (): void => {
      const expiry =
        ledger.projection().sessions.get(sessionId)?.lease?.expiry ??
        lease.expiry;
      narrate(
        `lease not renewed; the sweeper will collect it at ${isoOf(expiry)}`,
      );
    };

    const worktreePath = join(repoRoot, localConfig.value.worktreeRoot, node);
    const branch = `graph/${graph}/${node}`;
    const worktree = ensureNodeWorktree(
      repoRoot,
      worktreePath,
      graphBaseSha,
      branch,
    );
    if (isErr(worktree)) {
      const result = refuse("worktree", explainWorktreeRefusal(worktree.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate(`worktree at ${worktreePath} on ${graphBaseSha}`);
    const priorWork = priorWorkOf(worktree.value);
    if (priorWork !== undefined) {
      narrate(
        `worktree carries prior work: ${priorWork.uncommittedPaths} uncommitted path(s), ` +
          `${priorWork.commitsBeyondBase} commit(s) beyond the graph base`,
      );
    }

    const briefWritten = await writeBriefIntoWorktree(
      repoRoot,
      worktreePath,
      graph,
      node,
      graphBaseSha,
      sessionId,
      standingGates.value,
      declaration.gates,
    );
    if (isErr(briefWritten)) {
      const result = refuse(
        "brief",
        explainSessionBriefRefusal(briefWritten.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("brief written");
    for (const line of briefWritten.value.narration) narrate(line);

    const briefRelativePath = relative(worktreePath, briefWritten.value.path);
    const briefCommitted = commitBriefIfChanged(
      worktreePath,
      briefRelativePath,
      node,
      sessionId,
    );
    if (isErr(briefCommitted)) {
      const result = refuse(
        "brief commit",
        explainWorktreeRefusal(briefCommitted.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    if (briefCommitted.value !== undefined) {
      narrate(`brief committed ${briefCommitted.value}`);
    }

    for (const command of localConfig.value.worktreeSetup) {
      narrate(`worktree setup: ${command}`);
      const setup = await runSetupCommand(command, worktreePath);
      if (isErr(setup)) {
        const result = refuse(
          "worktree setup",
          explainWorktreeSetupRefusal(setup.error),
        );
        lease.stop();
        abandonLease();
        return result;
      }
    }

    const injectedRuntime = options.runtime;
    const createdRuntime =
      injectedRuntime === undefined
        ? await createHerdrRuntime()
        : ok(injectedRuntime);
    if (isErr(createdRuntime)) {
      const result = refuse(
        "runtime",
        explainRuntimeRefusal(createdRuntime.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    runtime = createdRuntime.value;

    const openedPane = await runtime.openPane(worktreePath);
    if (isErr(openedPane)) {
      const result = refuse(
        "pane open",
        explainRuntimeRefusal(openedPane.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    pane = openedPane.value;
    narrate(`pane ${pane.id} opened`);

    const startedAgent = await runtime.startAgent(
      pane,
      localConfig.value.runtime.kind,
      localConfig.value.runtime.args,
      () => narrate("waiting for the pane's shell"),
      node,
    );
    if (isErr(startedAgent)) {
      const result = refuse(
        "agent start",
        explainRuntimeRefusal(startedAgent.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    agent = startedAgent.value;
    narrate(`agent ${agent.id} started (${localConfig.value.runtime.kind})`);

    const reported = await runtime.reportIdentity(agent, graph, node, {
      sessionId,
    });
    if (isErr(reported)) {
      const result = refuse(
        "identity report",
        explainRuntimeRefusal(reported.error),
      );
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("identity reported");

    const startupTimeoutMs = localConfig.value.runtime.startupTimeoutMs;
    const startupAnswers = localConfig.value.runtime.startupAnswers;
    const answered = new Set<number>();
    let startupStatus = await runtime.waitUntil(
      agent,
      ["idle", "blocked"],
      startupTimeoutMs,
    );
    let startupScreen = "";
    while (isOk(startupStatus) && startupStatus.value !== "idle") {
      if (startupStatus.value === "blocked") {
        const screen = await runtime.read(agent);
        if (isErr(screen)) {
          const result = refuse("startup", explainRuntimeRefusal(screen.error));
          lease.stop();
          abandonLease();
          return result;
        }
        startupScreen = screen.value;
        const candidate = startupAnswers
          .map((answer, index) => ({ answer, index }))
          .find(
            ({ answer, index }) =>
              !answered.has(index) &&
              matchesScreen(answer.matches, startupScreen),
          );
        if (candidate === undefined) break;
        answered.add(candidate.index);
        const sent = await runtime.sendKeys(agent, candidate.answer.keys);
        if (isErr(sent)) {
          const result = refuse("startup", explainRuntimeRefusal(sent.error));
          lease.stop();
          abandonLease();
          return result;
        }
        narrate(`startup answer sent (${candidate.answer.matches})`);
      }
      startupStatus = await runtime.waitUntil(
        agent,
        ["idle", "blocked"],
        startupTimeoutMs,
      );
    }
    if (isErr(startupStatus)) {
      const explanation =
        startupStatus.error.kind === "timeout"
          ? `agent not ready after ${startupStatus.error.timeoutMs}ms; last status ${startupStatus.error.status}`
          : explainRuntimeRefusal(startupStatus.error);
      const result = refuse("startup", explanation);
      lease.stop();
      abandonLease();
      return result;
    }
    if (startupStatus.value === "blocked") {
      const line = `agent blocked at startup with no configured answer; screen: ${startupScreen.slice(0, 200)}`;
      narrate(line);
      lease.stop();
      abandonLease();
      return { exitCode: 1, message: line };
    }
    narrate("agent ready (idle)");

    const prompted = await runtime.prompt(
      agent,
      buildOpeningPrompt(graph, node, priorWork),
    );
    if (isErr(prompted)) {
      const result = refuse("prompt", explainRuntimeRefusal(prompted.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("prompt sent");

    const promptTakenTimeoutMs = localConfig.value.runtime.promptTakenTimeoutMs;
    const tookPrompt = await runtime.waitUntil(
      agent,
      ["working", "blocked", "done"],
      promptTakenTimeoutMs,
    );
    if (isErr(tookPrompt)) {
      const explanation =
        tookPrompt.error.kind === "timeout" &&
        tookPrompt.error.status === "idle"
          ? `prompt not taken after ${promptTakenTimeoutMs}ms; agent still idle`
          : explainRuntimeRefusal(tookPrompt.error);
      const result = refuse("prompt taken", explanation);
      lease.stop();
      abandonLease();
      return result;
    }
    // The pane now belongs to the person: it stays open on anything short of the node clearing.
    paneCustody = "person";
    if (tookPrompt.value === "working") narrate("agent working");

    narrate(
      `waiting for idle, blocked or done (timeout ${localConfig.value.runTimeoutMs}ms)`,
    );
    const deadline = deadlineFrom(
      clock.now().monoMs,
      ms(localConfig.value.runTimeoutMs),
    );
    const waited = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      narrate,
    );
    lease.stop();
    if (isErr(waited)) {
      const result = refuse("wait", explainRuntimeRefusal(waited.error));
      abandonLease();
      return result;
    }

    const screenRead = await runtime.read(agent);
    if (isErr(screenRead)) {
      narrate(
        `agent screen read refused: ${explainRuntimeRefusal(screenRead.error)}`,
      );
    }

    const dirty = uncommittedPaths(worktreePath);
    if (isErr(dirty)) {
      const result = refuse(
        "worktree status",
        explainWorktreeRefusal(dirty.error),
      );
      abandonLease();
      return result;
    }

    if (isOk(screenRead)) {
      await writeScreenSnapshot(worktreePath, graph, node, screenRead.value);
      narrate(
        `agent screen: ${lastNonEmptyLine(screenRead.value) ?? "(no output)"}`,
      );
    }

    if (dirty.value.length > 0) {
      const because = `${dirty.value.length} uncommitted path(s) in the worktree; gates judge commits only`;
      narrate(because);
      for (const path of dirty.value.slice(0, 5)) narrate(`  ${path}`);
      const held = outcome.held(
        [],
        heldOn.uncommittedWork(dirty.value.length),
        because,
        clock.now().wallMs + HELD_REVISIT_MS,
      );
      ledger.append({ kind: "outcome-set", node: targetNode, outcome: held });
      return {
        exitCode: 0,
        message: `${node}: ${held.kind} (session ${sessionId}, agent status ${waited.value}).`,
      };
    }

    const debriefedSha = currentCommitSha(worktreePath);
    const judged = await judgeGates({
      ledger,
      clock,
      node: targetNode,
      session: sessionId,
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
      const result = refuse("gates", explainGateJudgeRefusal(judged.error));
      abandonLease();
      return result;
    }
    if (judged.value.kind === "cleared") paneCustody = "runner";

    return {
      exitCode: 0,
      message: `${node}: ${judged.value.kind} (session ${sessionId}, agent status ${waited.value}).`,
    };
  } finally {
    if (pane !== undefined && runtime !== undefined) {
      if (paneCustody === "runner") {
        await runtime.closePane(pane);
      } else {
        narrate(`pane ${pane.id} left open for drilldown`);
      }
    }
    await ledger.close();
  }
}
