import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { type Clock, createSystemClock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { isErr, isOk, ok } from "@phyxiusjs/fp";
import { debriefFilePath, renderSlice } from "debrief";
import {
  currentCommitSha,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { createLedger } from "ledger";
import {
  type Agent,
  authoritativeBriefGates,
  buildBrief,
  buildOpeningPrompt,
  commitBriefIfChanged,
  createHerdrRuntime,
  declaredGateIds,
  ensureNodeWorktree,
  explainGateJudgeRefusal,
  explainLocalConfigRefusal,
  explainRuntimeRefusal,
  explainStandingGatesRefusal,
  explainWorktreeRefusal,
  explainWorktreeSetupRefusal,
  gateCommandTable,
  gitTrackedFiles,
  HELD_REVISIT_MS,
  interpreterBriefBody,
  isCommittedAtHead,
  judgeWorktree,
  lastNonEmptyLine,
  loadLocalConfig,
  loadStandingGates,
  matchesScreen,
  type Pane,
  type PriorWork,
  type Runtime,
  recordingNarrate,
  renderBriefFile,
  runWorktreeSetup,
  takeLease,
  type UnfinishedWork,
  uncommittedPaths,
  type WorktreeOutcome,
  waitForSession,
  withRenderedContextSlice,
  writeScreenSnapshot,
} from "runner";
import { narrateContext, substrateClientFor } from "substrate";
import { parseFlag } from "./flags.ts";
import type { CommandResult } from "./main.ts";

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

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

const USAGE =
  'interlock plan: expected a graph id and --ask, e.g. "interlock plan 0004-example ' +
  '--ask "<text>" [--correction "<reason>"]".';

export async function runInterlockPlan(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly runtime?: Runtime;
    readonly narrate?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  const [graph] = args;
  if (graph === undefined) return { exitCode: 1, message: USAGE };

  const ask = parseFlag(args, "--ask");
  if (ask === undefined) {
    return {
      exitCode: 1,
      message: "interlock plan: refuses without --ask; a plan needs a request to interpret.",
    };
  }
  const correctionReason = parseFlag(args, "--correction");

  let narrate =
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

  const standingGates = await loadStandingGates(repoRoot);
  if (isErr(standingGates)) {
    return {
      exitCode: 1,
      message: explainStandingGatesRefusal(standingGates.error),
    };
  }

  let previousGraphYaml: string | undefined;
  if (correctionReason !== undefined) {
    const path = graphFilePath(repoRoot, graph);
    try {
      previousGraphYaml = await readFile(path, "utf-8");
    } catch {
      return {
        exitCode: 1,
        message: `${path}: no such file; --correction reopens an existing graph, not a new one.`,
      };
    }
  }

  const node = `plan/${graph}`;
  const targetNode = { graph, id: node };

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
  let paneCustody: "runner" | "person" = "runner";

  try {
    const requestedGraphBaseSha = currentCommitSha(repoRoot);

    const worktreePath = join(repoRoot, localConfig.value.worktreeRoot, node);
    const branch = `graph/${graph}/${node}`;
    const worktree = ensureNodeWorktree(repoRoot, worktreePath, requestedGraphBaseSha, branch);
    if (isErr(worktree)) {
      return {
        exitCode: 1,
        message: `worktree refused: ${explainWorktreeRefusal(worktree.error)}`,
      };
    }
    const graphBaseSha = worktree.value.base;

    const gateIds = declaredGateIds(standingGates.value, []);
    const sessionId = randomUUID();
    const acceptance =
      `Produce .interlock/graphs/${graph}.yaml, a graph@v0 document derived from the ask, ` +
      "and a debrief; never lease or run a node of the graph.";
    const brief = buildBrief(
      graph,
      node,
      acceptance,
      gateIds,
      gitTrackedFiles(repoRoot),
      "interpreter",
    );
    ledger.append({
      kind: "session-started",
      session: { id: sessionId, node: targetNode },
      brief,
      graphBaseSha,
    });
    narrate = recordingNarrate(ledger, clock, sessionId, narrate);

    const lease = takeLease(ledger, clock, targetNode, sessionId, localConfig.value.leaseMs);
    narrate(`leased ${node} (session ${sessionId}, expires ${isoOf(lease.expiry)})`);

    const refuse = (step: string, explanation: string): CommandResult => {
      const line = `${step} refused: ${explanation}`;
      narrate(line);
      return { exitCode: 1, message: line };
    };
    const abandonLease = (): void => {
      const expiry = ledger.projection().sessions.get(sessionId)?.lease?.expiry ?? lease.expiry;
      narrate(`lease not renewed; the sweeper will collect it at ${isoOf(expiry)}`);
    };

    narrate(`worktree at ${worktreePath} on ${graphBaseSha}`);
    if (graphBaseSha !== requestedGraphBaseSha) {
      narrate(
        `branch base ${graphBaseSha.slice(0, 7)} is behind main ${requestedGraphBaseSha.slice(0, 7)}; the session rebases before it opens a pull request`,
      );
    }
    const priorWork = priorWorkOf(worktree.value);
    if (priorWork !== undefined) {
      narrate(
        `worktree carries prior work: ${priorWork.uncommittedPaths} uncommitted path(s), ` +
          `${priorWork.commitsBeyondBase} commit(s) beyond the graph base`,
      );
    }

    const correction =
      previousGraphYaml === undefined || correctionReason === undefined
        ? undefined
        : { reason: correctionReason, previousGraphYaml };
    if (correction !== undefined) {
      narrate(`correction: ${correction.reason}`);
    }

    const scope = gitTrackedFiles(repoRoot);
    const contextOutcome = await substrate.context(targetNode, scope, "interpreter");
    narrate(narrateContext(substrate.address, contextOutcome));
    const body = interpreterBriefBody(graph, node, ask, correction);
    const renderedBody =
      contextOutcome.kind === "rendered"
        ? withRenderedContextSlice(body, renderSlice(substrate.address, contextOutcome.items))
        : body;

    const briefContent = renderBriefFile(
      {
        graph,
        node,
        role: "interpreter",
        gates: authoritativeBriefGates(standingGates.value, []),
        scope,
        substrate: { address: substrate.address },
        runner: { kind: "worktree", graphBaseSha, session: sessionId },
      },
      renderedBody,
    );

    const briefDestination = join(worktreePath, ".interlock", "sessions", graph, node, "brief.md");
    try {
      await mkdir(dirname(briefDestination), { recursive: true });
      await writeFile(briefDestination, briefContent, "utf-8");
    } catch (error) {
      const result = refuse(
        "brief",
        `${briefDestination}: ${error instanceof Error ? error.message : String(error)}`,
      );
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("brief written");

    const briefRelativePath = relative(worktreePath, briefDestination);
    const briefCommitted = commitBriefIfChanged(worktreePath, briefRelativePath, node, sessionId);
    if (isErr(briefCommitted)) {
      const result = refuse("brief commit", explainWorktreeRefusal(briefCommitted.error));
      lease.stop();
      abandonLease();
      return result;
    }
    if (briefCommitted.value !== undefined) {
      narrate(`brief committed ${briefCommitted.value}`);
    }

    const setUp = await runWorktreeSetup(localConfig.value.worktreeSetup, worktreePath, narrate);
    if (isErr(setUp)) {
      const result = refuse("worktree setup", explainWorktreeSetupRefusal(setUp.error));
      lease.stop();
      abandonLease();
      return result;
    }

    const injectedRuntime = options.runtime;
    const createdRuntime =
      injectedRuntime === undefined ? await createHerdrRuntime() : ok(injectedRuntime);
    if (isErr(createdRuntime)) {
      const result = refuse("runtime", explainRuntimeRefusal(createdRuntime.error));
      lease.stop();
      abandonLease();
      return result;
    }
    runtime = createdRuntime.value;

    const openedPane = await runtime.openPane(worktreePath);
    if (isErr(openedPane)) {
      const result = refuse("pane open", explainRuntimeRefusal(openedPane.error));
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
      const result = refuse("agent start", explainRuntimeRefusal(startedAgent.error));
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
      const result = refuse("identity report", explainRuntimeRefusal(reported.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("identity reported");

    const startupTimeoutMs = localConfig.value.runtime.startupTimeoutMs;
    const startupAnswers = localConfig.value.runtime.startupAnswers;
    const answered = new Set<number>();
    let startupStatus = await runtime.waitUntil(agent, ["idle", "blocked"], startupTimeoutMs);
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
              !answered.has(index) && matchesScreen(answer.matches, startupScreen),
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
      startupStatus = await runtime.waitUntil(agent, ["idle", "blocked"], startupTimeoutMs);
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

    const prompted = await runtime.prompt(agent, buildOpeningPrompt(graph, node, priorWork));
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
        tookPrompt.error.kind === "timeout" && tookPrompt.error.status === "idle"
          ? `prompt not taken after ${promptTakenTimeoutMs}ms; agent still idle`
          : explainRuntimeRefusal(tookPrompt.error);
      const result = refuse("prompt taken", explanation);
      lease.stop();
      abandonLease();
      return result;
    }
    paneCustody = "person";
    if (tookPrompt.value === "working") narrate("agent working");

    const readUnfinishedWork = (): UnfinishedWork | undefined => {
      const dirty = uncommittedPaths(worktreePath);
      const dirtyCount = isOk(dirty) ? dirty.value.length : 0;
      const debriefRelative = relative(worktreePath, debriefFilePath(worktreePath, graph, node));
      const debriefMissing = !isCommittedAtHead(worktreePath, debriefRelative);
      return dirtyCount === 0 && !debriefMissing
        ? undefined
        : { uncommittedPaths: dirtyCount, debriefMissing };
    };

    narrate(`waiting for idle, blocked or done (timeout ${localConfig.value.runTimeoutMs}ms)`);
    const deadline = deadlineFrom(clock.now().monoMs, ms(localConfig.value.runTimeoutMs));
    const waited = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      localConfig.value.runTimeoutMs,
      localConfig.value.answerGraceMs,
      narrate,
      readUnfinishedWork,
    );
    lease.stop();
    if (isErr(waited)) {
      const result = refuse("wait", explainRuntimeRefusal(waited.error));
      abandonLease();
      return result;
    }

    const screenRead = await runtime.read(agent);
    if (isErr(screenRead)) {
      narrate(`agent screen read refused: ${explainRuntimeRefusal(screenRead.error)}`);
    }

    const judged = await judgeWorktree({
      ledger,
      clock,
      node: targetNode,
      session: sessionId,
      declaredGateIds: gateIds,
      commandFor: gateCommandTable(standingGates.value, []),
      worktree: worktreePath,
      narrate,
      runnerId: `plan-${sessionId}`,
      holdMs: HELD_REVISIT_MS,
      substrate,
      onWorktreeRead: async () => {
        if (!isOk(screenRead)) return;
        await writeScreenSnapshot(worktreePath, graph, node, screenRead.value);
        narrate(`agent screen: ${lastNonEmptyLine(screenRead.value) ?? "(no output)"}`);
      },
    });
    if (isErr(judged)) {
      const result =
        judged.error.kind === "worktree-status"
          ? refuse("worktree status", explainWorktreeRefusal(judged.error.refusal))
          : refuse("gates", explainGateJudgeRefusal(judged.error.refusal));
      abandonLease();
      return result;
    }

    if (judged.value.kind === "cleared") paneCustody = "runner";

    const producedGraph = await loadGraphDocument(graphFilePath(worktreePath, graph));
    if (isErr(producedGraph)) {
      return { exitCode: 1, message: explainGraphRefusal(producedGraph.error) };
    }

    narrate(`${graph}: graph landed not approved`);
    return {
      exitCode: 0,
      message: `${node}: ${judged.value.kind} (session ${sessionId}, agent status ${waited.value}); ${graph} landed not approved.`,
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
