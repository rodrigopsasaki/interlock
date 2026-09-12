import { randomUUID } from "node:crypto";
import { join, relative } from "node:path";
import { type Clock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { debriefFilePath } from "debrief";
import { currentCommitSha, type GateDeclaration, sharedJournalDirectory } from "face";
import { type HeldOn, type Ledger, type Outcome, outcome, readRawEvents } from "ledger";
import type { SubstrateClient } from "substrate";
import { declaredGateIds, gateCommandTable } from "./gateCommand.ts";
import { explainGateJudgeRefusal } from "./gateJudge.ts";
import { createHerdrRuntime } from "./herdr/adapter.ts";
import { HELD_REVISIT_MS, judgeWorktree } from "./judgeWorktree.ts";
import { takeLease } from "./lease.ts";
import type { LocalConfig } from "./localConfig.ts";
import { recordingNarrate } from "./narration.ts";
import { buildOpeningPrompt, type PriorWork } from "./openingPrompt.ts";
import { type Agent, explainRuntimeRefusal, type Pane, type Runtime } from "./runtime.ts";
import { gitTrackedFiles } from "./scope.ts";
import { type BriefWriteOutcome, buildBrief } from "./sessionBrief.ts";
import { lastNonEmptyLine, writeScreenSnapshot } from "./sessionScreen.ts";
import { type UnfinishedWork, waitForSession } from "./sessionWait.ts";
import type { StandingGate } from "./standingGates.ts";
import { matchesScreen } from "./startupAnswers.ts";
import {
  commitBriefIfChanged,
  ensureNodeWorktree,
  explainWorktreeRefusal,
  isCommittedAtHead,
  uncommittedPaths,
  type WorktreeOutcome,
} from "./worktree.ts";
import { explainWorktreeSetupRefusal, runWorktreeSetup } from "./worktreeSetup.ts";

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

export interface BeforeJudgeRefusal {
  readonly on: HeldOn;
  readonly because: string;
}

export interface DriveSessionOutcome {
  readonly exitCode: number;
  readonly message: string;
}

export interface DriveSessionRequest {
  readonly repoRoot: string;
  readonly graph: string;
  readonly node: string;
  readonly role: string;
  readonly acceptance: string;
  readonly nodeGates: readonly GateDeclaration[];
  readonly localConfig: LocalConfig;
  readonly standingGates: readonly StandingGate[];
  readonly substrate: SubstrateClient;
  readonly ledger: Ledger;
  readonly clock: Clock;
  readonly narrate: (line: string) => void;
  readonly runtime?: Runtime;
  readonly runnerIdPrefix: string;
  readonly afterWorktree?: (worktreePath: string) => Promise<Result<void, string>>;
  readonly composeBrief: (
    worktreePath: string,
    graphBaseSha: string,
    session: string,
  ) => Promise<Result<BriefWriteOutcome, string>>;
  readonly beforeJudge?: (worktreePath: string) => Promise<Result<void, BeforeJudgeRefusal>>;
  readonly describeDone?: (kind: Outcome["kind"], narrate: (line: string) => void) => string;
}

export async function driveInteractiveSession(
  request: DriveSessionRequest,
): Promise<DriveSessionOutcome> {
  const {
    repoRoot,
    graph,
    node,
    role,
    acceptance,
    nodeGates,
    localConfig,
    standingGates,
    substrate,
    ledger,
    clock,
    runtime: injectedRuntime,
    runnerIdPrefix,
    afterWorktree,
    composeBrief,
    beforeJudge,
    describeDone,
  } = request;
  let narrate = request.narrate;

  let pane: Pane | undefined;
  let agent: Agent | undefined;
  let runtime: Runtime | undefined;
  let paneCustody: "runner" | "person" = "runner";

  try {
    const requestedGraphBaseSha = currentCommitSha(repoRoot);
    const targetNode = { graph, id: node };

    const worktreePath = join(repoRoot, localConfig.worktreeRoot, node);
    const branch = `graph/${graph}/${node}`;
    const worktree = ensureNodeWorktree(repoRoot, worktreePath, requestedGraphBaseSha, branch);
    if (isErr(worktree)) {
      return {
        exitCode: 1,
        message: `worktree refused: ${explainWorktreeRefusal(worktree.error)}`,
      };
    }
    const graphBaseSha = worktree.value.base;

    if (afterWorktree !== undefined) {
      const checked = await afterWorktree(worktreePath);
      if (isErr(checked)) {
        return { exitCode: 1, message: checked.error };
      }
    }

    const gateIds = declaredGateIds(standingGates, nodeGates);
    const sessionId = randomUUID();
    const brief = buildBrief(graph, node, acceptance, gateIds, gitTrackedFiles(repoRoot), role);
    ledger.append({
      kind: "session-started",
      session: { id: sessionId, node: targetNode },
      brief,
      graphBaseSha,
    });
    narrate = recordingNarrate(ledger, clock, sessionId, narrate);

    const lease = takeLease(ledger, clock, targetNode, sessionId, localConfig.leaseMs);
    narrate(`leased ${node} (session ${sessionId}, expires ${isoOf(lease.expiry)})`);

    const refuse = (step: string, explanation: string): DriveSessionOutcome => {
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

    const briefWritten = await composeBrief(worktreePath, graphBaseSha, sessionId);
    if (isErr(briefWritten)) {
      const result = refuse("brief", briefWritten.error);
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("brief written");
    for (const line of briefWritten.value.narration) narrate(line);

    const briefRelativePath = relative(worktreePath, briefWritten.value.path);
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

    const setUp = await runWorktreeSetup(localConfig.worktreeSetup, worktreePath, narrate);
    if (isErr(setUp)) {
      const result = refuse("worktree setup", explainWorktreeSetupRefusal(setUp.error));
      lease.stop();
      abandonLease();
      return result;
    }

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
      localConfig.runtime.kind,
      localConfig.runtime.args,
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
    narrate(`agent ${agent.id} started (${localConfig.runtime.kind})`);

    const reported = await runtime.reportIdentity(agent, graph, node, { sessionId });
    if (isErr(reported)) {
      const result = refuse("identity report", explainRuntimeRefusal(reported.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("identity reported");

    const startupTimeoutMs = localConfig.runtime.startupTimeoutMs;
    const startupAnswers = localConfig.runtime.startupAnswers;
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

    const prompted = await runtime.prompt(agent, buildOpeningPrompt(graph, node, priorWork, role));
    if (isErr(prompted)) {
      const result = refuse("prompt", explainRuntimeRefusal(prompted.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("prompt sent");

    const promptTakenTimeoutMs = localConfig.runtime.promptTakenTimeoutMs;
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

    narrate(`waiting for idle, blocked or done (timeout ${localConfig.runTimeoutMs}ms)`);
    const deadline = deadlineFrom(clock.now().monoMs, ms(localConfig.runTimeoutMs));
    const waited = await waitForSession(
      runtime,
      agent,
      clock,
      deadline,
      localConfig.runTimeoutMs,
      localConfig.answerGraceMs,
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

    const onWorktreeRead = async (): Promise<void> => {
      if (!isOk(screenRead)) return;
      await writeScreenSnapshot(worktreePath, graph, node, screenRead.value);
      narrate(`agent screen: ${lastNonEmptyLine(screenRead.value) ?? "(no output)"}`);
    };

    const personEventsRead = await readRawEvents(sharedJournalDirectory(repoRoot));

    if (beforeJudge !== undefined) {
      const preCheck = await beforeJudge(worktreePath);
      if (isErr(preCheck)) {
        await onWorktreeRead();
        const held = outcome.held(
          [],
          preCheck.error.on,
          preCheck.error.because,
          clock.now().wallMs + HELD_REVISIT_MS,
        );
        ledger.append({ kind: "outcome-set", node: targetNode, outcome: held });
        const result = refuse("graph", preCheck.error.because);
        abandonLease();
        return result;
      }
    }

    const judged = await judgeWorktree({
      ledger,
      clock,
      node: targetNode,
      session: sessionId,
      declaredGateIds: gateIds,
      commandFor: gateCommandTable(standingGates, nodeGates),
      worktree: worktreePath,
      narrate,
      runnerId: `${runnerIdPrefix}-${sessionId}`,
      holdMs: HELD_REVISIT_MS,
      substrate,
      personEvents: isErr(personEventsRead) ? [] : personEventsRead.value,
      onWorktreeRead,
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

    const suffix = describeDone?.(judged.value.kind, narrate);
    const base = `${node}: ${judged.value.kind} (session ${sessionId}, agent status ${waited.value})`;
    return {
      exitCode: 0,
      message: suffix === undefined ? `${base}.` : `${base}; ${suffix}`,
    };
  } finally {
    if (pane !== undefined && runtime !== undefined) {
      if (paneCustody === "runner") {
        await runtime.closePane(pane);
      } else {
        narrate(`pane ${pane.id} left open for drilldown`);
      }
    }
  }
}
