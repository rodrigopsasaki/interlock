import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { type Clock, deadlineFrom, ms } from "@phyxiusjs/clock";
import { err, isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import { debriefFilePath } from "debrief";
import { currentCommitSha, type GateDeclaration, sharedJournalDirectory } from "face";
import {
  type HeldOn,
  heldOn,
  type Ledger,
  nodeKey,
  type Outcome,
  outcome,
  readRawEvents,
  sessionRuntime,
} from "ledger";
import type { SubstrateClient } from "substrate";
import { type CodexLaunchRefusal, prepareCodexLaunch } from "./codex/config.ts";
import { needsPaneEnvironment } from "./codex/environment.ts";
import { type ExecPhaseRequest, execRunRoot, runExecPhase } from "./execRuntime.ts";
import { declaredGateIds, gateCommandTable } from "./gateCommand.ts";
import { explainGateJudgeRefusal } from "./gateJudge.ts";
import { createHerdrLaunchRuntime } from "./herdr/adapter.ts";
import { HELD_REVISIT_MS, judgeWorktree } from "./judgeWorktree.ts";
import { takeLease } from "./lease.ts";
import type { LocalConfig } from "./localConfig.ts";
import {
  admitMachine,
  closeMachinePane,
  type MachineHold,
  machineDelivery,
  machineIntent,
  reconcileMachine,
} from "./machineOutbox.ts";
import {
  type MachineAttempt,
  providerArgv,
  resolveMachine,
  runProviderCommand,
  validateExecMachine,
} from "./machineProvider.ts";
import { recordingNarrate } from "./narration.ts";
import { buildOpeningPrompt, type PriorWork, type SessionRole } from "./openingPrompt.ts";
import { deliverOpeningPrompt } from "./promptDelivery.ts";
import { recordQuestionNotes } from "./questionNotes.ts";
import type { RoleShape } from "./roleShape.ts";
import { commitRunnerCode, commitRunnerDebrief } from "./runnerCommits.ts";
import { type MarkerConflict, mergeRunnerMarker, runnerMarker } from "./runnerMarker.ts";
import {
  type Agent,
  explainRuntimeRefusal,
  observeRuntime,
  type Pane,
  type PreparedLaunch,
  type Runtime,
} from "./runtime.ts";
import { execRuntimeArgv, type ResolvedRuntime } from "./runtimeCatalogue.ts";
import { gitTrackedFiles } from "./scope.ts";
import { changedScopePaths, describeScopeChange, snapshotScope } from "./scopeGuard.ts";
import { type BriefWriteOutcome, buildBrief } from "./sessionBrief.ts";
import { findInheritedSessionStart, type SessionInheritance } from "./sessionRange.ts";
import { lastNonEmptyLine, writeScreenSnapshot } from "./sessionScreen.ts";
import { type UnfinishedWork, waitForSession } from "./sessionWait.ts";
import type { StandingGate } from "./standingGates.ts";
import { matchesScreen } from "./startupAnswers.ts";
import {
  baseHoldsGraph,
  commitBriefIfChanged,
  ensureNodeWorktree,
  explainWorktreeRefusal,
  isCommittedAtHead,
  isIgnoredPath,
  uncommittedPaths,
  type WorktreeOutcome,
  type WorktreeRefusal,
  worktreeGitLayout,
  worktreeHead,
} from "./worktree.ts";
import { explainWorktreeSetupRefusal, runWorktreeSetup } from "./worktreeSetup.ts";
import { expandWritableRootArgs } from "./writableRootArgs.ts";

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

export interface PrepareLaunchOptions {
  readonly narrate?: (line: string) => void;
  readonly listCodexMcp?: (
    cwd: string,
    environment: Readonly<Record<string, string>>,
  ) => Result<readonly string[], string>;
}

type LaunchRefusal = WorktreeRefusal | MarkerConflict | CodexLaunchRefusal;

function explainLaunchRefusal(refusal: LaunchRefusal): string {
  if (refusal.kind === "marker-conflict") {
    return `launch refused: ${refusal.key} is already set to a different value`;
  }
  if (refusal.kind === "codex-launch-refusal") {
    const names = refusal.servers.length === 0 ? "Codex" : refusal.servers.join(", ");
    return `launch refused for ${names}: ${refusal.because}`;
  }
  return explainWorktreeRefusal(refusal);
}

export function prepareLaunch(
  agentRuntime: ResolvedRuntime,
  worktreePath: string,
  environment: Readonly<Record<string, string>> = {},
  options: PrepareLaunchOptions = {},
): Result<AgentLaunch, LaunchRefusal> {
  const template = agentRuntime.writableRootArgs;
  const writableRoots =
    template === undefined
      ? []
      : (() => {
          const layout = worktreeGitLayout(worktreePath);
          if (isErr(layout) || layout.value.kind === "not-linked") return [];
          return [layout.value.commonGitDir, layout.value.gitDir];
        })();
  if (template !== undefined && writableRoots.length === 0) {
    const layout = worktreeGitLayout(worktreePath);
    if (isErr(layout)) return layout;
  }
  const launchArgs = [
    ...agentRuntime.args,
    ...(template === undefined
      ? []
      : writableRoots.flatMap((root) => expandWritableRootArgs(template, root))),
  ];
  if (agentRuntime.kind === "codex") {
    const prepared = prepareCodexLaunch(launchArgs, worktreePath, environment, {
      ...(options.narrate === undefined ? {} : { narrate: options.narrate }),
      ...(options.listCodexMcp === undefined ? {} : { listCodexMcp: options.listCodexMcp }),
    });
    if (isErr(prepared)) return prepared;
    return ok({
      program: agentRuntime.kind,
      args: prepared.value.args,
      cwd: worktreePath,
      environment: prepared.value.environment,
      writableRoots,
      cleanup: prepared.value.cleanup,
    });
  }
  return ok({
    program: agentRuntime.kind,
    args: launchArgs,
    cwd: worktreePath,
    environment,
    writableRoots,
  });
}

type AgentLaunch = PreparedLaunch;

export interface BeforeJudgeRefusal {
  readonly on: HeldOn;
  readonly because: string;
}

export interface DriveSessionOutcome {
  readonly exitCode: number;
  readonly message: string;
}

export interface DriveSessionRequest {
  readonly machine?: MachineAttempt;
  readonly paths?: readonly string[];
  readonly repoRoot: string;
  readonly graph: string;
  readonly node: string;
  readonly role: SessionRole;
  readonly shape?: RoleShape;
  readonly acceptance: string;
  readonly nodeGates: readonly GateDeclaration[];
  readonly authoritativeGraphPath?: string;
  readonly parsedGraphHash?: string;
  readonly localConfig: LocalConfig;
  readonly agentRuntime: ResolvedRuntime;
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
  readonly beforeRuntime?: () => Promise<Result<void, string>>;
  readonly describeDone?: (kind: Outcome["kind"], narrate: (line: string) => void) => string;
}

type AbandonStepName =
  | "brief"
  | "worktree setup"
  | "writable root"
  | "runtime"
  | "pane open"
  | "pane pid"
  | "agent start"
  | "identity report"
  | "startup"
  | "prompt"
  | "wait"
  | "debrief prompt"
  | "debrief wait"
  | "graph"
  | "worktree status"
  | "gates";

type CommitStepName = "brief commit" | "code commit" | "debrief commit";

type RefusalStep =
  | { readonly kind: "abandon"; readonly name: AbandonStepName }
  | { readonly kind: "commit"; readonly name: CommitStepName };

function abandon(name: AbandonStepName): RefusalStep {
  return { kind: "abandon", name };
}

function commit(name: CommitStepName): RefusalStep {
  return { kind: "commit", name };
}

export async function driveInteractiveSession(
  request: DriveSessionRequest,
): Promise<DriveSessionOutcome> {
  const {
    repoRoot,
    graph,
    node,
    role,
    shape,
    acceptance,
    nodeGates,
    localConfig,
    agentRuntime,
    standingGates,
    substrate,
    ledger,
    clock,
    runtime: injectedRuntime,
    runnerIdPrefix,
    afterWorktree,
    composeBrief,
    beforeJudge,
    beforeRuntime,
    describeDone,
  } = request;
  let narrate = request.narrate;

  let pane: Pane | undefined;
  let agent: Agent | undefined;
  let runtime: Runtime | undefined;
  let launchCleanup: (() => void) | undefined;
  let cleanup: { readonly session: string; readonly hold: MachineHold } | undefined;
  let stopLease: (() => void) | undefined;
  let paneCustody: "runner" | "person" = "runner";

  const drive = async (): Promise<DriveSessionOutcome> => {
    const machine =
      request.machine === undefined ? await resolveMachine(repoRoot) : ok(request.machine);
    if (isErr(machine)) {
      narrate(machine.error);
      return { exitCode: 1, message: machine.error };
    }
    if (beforeRuntime !== undefined) {
      const checked = await beforeRuntime();
      if (isErr(checked)) {
        narrate(checked.error);
        return { exitCode: 1, message: checked.error };
      }
    }

    const createdRuntime =
      injectedRuntime === undefined ? await createHerdrLaunchRuntime() : ok(injectedRuntime);
    if (isErr(createdRuntime)) {
      const message =
        createdRuntime.error.kind === "not-ready"
          ? explainRuntimeRefusal(createdRuntime.error)
          : `runtime preflight refused: ${explainRuntimeRefusal(createdRuntime.error)}`;
      narrate(message);
      return { exitCode: 1, message };
    }
    runtime = createdRuntime.value;
    if (runtime.checkServer !== undefined) {
      const checked = await runtime.checkServer();
      if (isErr(checked)) {
        const message = explainRuntimeRefusal(checked.error);
        narrate(message);
        return { exitCode: 1, message };
      }
    }

    if (
      machine.value.provider !== "none" &&
      needsPaneEnvironment(agentRuntime.kind) &&
      runtime.paneEnvironment !== true
    ) {
      const message =
        "machine.provider.env cannot reach this agent: runtime offers no pane environment";
      narrate(message);
      return { exitCode: 1, message };
    }
    const recovered = await reconcileMachine(ledger, runtime, narrate, clock);
    if (isErr(recovered)) return { exitCode: 1, message: recovered.error };

    const requestedGraphBaseSha = await currentCommitSha(repoRoot);
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
    const sessionId = randomUUID();
    const markedEnvironment = mergeRunnerMarker(
      machine.value.env,
      runnerMarker(sessionId, graph, node),
    );
    if (isErr(markedEnvironment)) {
      const message = explainLaunchRefusal(markedEnvironment.error);
      narrate(message);
      return { exitCode: 1, message };
    }
    const agentEnvironment = markedEnvironment.value;
    const worktreeHeadSha = worktreeHead(worktreePath);
    const journalEvents = await readRawEvents(ledger.directory());
    const inheritedFallback: SessionInheritance = {
      kind: "none",
      because: "could not inspect the resumed worktree",
    };
    const inherited: SessionInheritance =
      isOk(worktreeHeadSha) && isOk(journalEvents)
        ? findInheritedSessionStart(
            worktreePath,
            journalEvents.value,
            graph,
            node,
            graphBaseSha,
            worktreeHeadSha.value,
            sessionId,
          )
        : inheritedFallback;

    if (role !== "interpreter") {
      const graphAtBase = baseHoldsGraph(repoRoot, graphBaseSha, graph, node);
      if (isErr(graphAtBase)) {
        const message = explainWorktreeRefusal(graphAtBase.error);
        narrate(message);
        return { exitCode: 1, message };
      }
    }

    if (afterWorktree !== undefined) {
      const checked = await afterWorktree(worktreePath);
      if (isErr(checked)) {
        return { exitCode: 1, message: checked.error };
      }
    }

    const gateIds = declaredGateIds(standingGates, nodeGates);
    const brief = buildBrief(graph, node, acceptance, gateIds, gitTrackedFiles(repoRoot), role);
    ledger.append({
      kind: "session-started",
      session: {
        id: sessionId,
        node: targetNode,
        runtime: sessionRuntime.declared(agentRuntime.name, agentRuntime.kind, agentRuntime.model, {
          provider: agentRuntime.provider ?? "unknown",
          ...(agentRuntime.chosenBy === undefined ? {} : { chosenBy: agentRuntime.chosenBy }),
        }),
      },
      brief,
      graphBaseSha,
      ...(inherited.kind === "inherited"
        ? {
            inheritedStartSha: inherited.inheritedStartSha,
            predecessorSession: inherited.predecessorSession,
          }
        : {}),
      ...(shape === undefined ? {} : { walk: shape.walk }),
      startedAt: clock.now().wallMs,
    });
    narrate = recordingNarrate(ledger, clock, sessionId, narrate);

    const lease = takeLease(ledger, clock, targetNode, sessionId, localConfig.leaseMs);
    stopLease = () => lease.stop();
    narrate(`leased ${node} (session ${sessionId}, expires ${isoOf(lease.expiry)})`);
    if (machine.value.provider === "none") narrate("no machine provider (provider: none)");

    const refuse = (step: RefusalStep, explanation: string): DriveSessionOutcome => {
      const line = `${step.name} refused: ${explanation}`;
      narrate(line);
      if (step.kind === "commit" && agentRuntime.commits === "runner") {
        ledger.append({
          kind: "outcome-set",
          node: targetNode,
          outcome: outcome.failed([], step.name, "repair", line),
        });
      }
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
      const result = refuse(abandon("brief"), briefWritten.error);
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("brief written");
    for (const line of briefWritten.value.narration) narrate(line);

    const briefRelativePath = relative(worktreePath, briefWritten.value.path);
    const briefCommitted = commitBriefIfChanged(worktreePath, briefRelativePath, node, sessionId);
    if (isErr(briefCommitted)) {
      const result = refuse(commit("brief commit"), explainWorktreeRefusal(briefCommitted.error));
      lease.stop();
      abandonLease();
      return result;
    }
    if (briefCommitted.value !== undefined) {
      narrate(`brief committed ${briefCommitted.value}`);
    }

    const setUp = await runWorktreeSetup(
      localConfig.worktreeSetup,
      worktreePath,
      narrate,
      { ...process.env, ...machine.value.env },
      machine.value.heavy,
    );
    if (isErr(setUp)) {
      if (setUp.error.kind === "node-engine") {
        const because = setUp.error.because;
        narrate(because);
        const held = outcome.held(
          [],
          heldOn.gateFailure(because, "hold"),
          because,
          clock.now().wallMs + HELD_REVISIT_MS,
        );
        ledger.append({ kind: "outcome-set", node: targetNode, outcome: held });
        abandonLease();
        return { exitCode: 0, message: `${node}: held (${because}).` };
      }
      const result = refuse(abandon("worktree setup"), explainWorktreeSetupRefusal(setUp.error));
      lease.stop();
      abandonLease();
      return result;
    }

    const scopeGuardBecause = (phase: string, detail: string): string =>
      `scope guard held node: session ${sessionId}, phase ${phase}, runtime profile ${agentRuntime.name}; ${detail}`;
    const holdForScopeGuard = (phase: string, detail: string): DriveSessionOutcome => {
      const because = scopeGuardBecause(phase, detail);
      narrate(because);
      const held = outcome.held(
        [],
        heldOn.gateFailure(because, "hold"),
        because,
        clock.now().wallMs + HELD_REVISIT_MS,
      );
      ledger.append({ kind: "outcome-set", node: targetNode, outcome: held });
      abandonLease();
      return { exitCode: 1, message: because };
    };

    if (agentRuntime.kind === "exec") {
      const openingPrompt = buildOpeningPrompt(
        graph,
        node,
        priorWork,
        role,
        briefWritten.value.openingView,
        shape?.entry.prompt,
        agentRuntime.commits,
      );
      const argv = execRuntimeArgv(agentRuntime, openingPrompt);
      const program = argv[0];
      if (program === undefined) {
        lease.stop();
        return refuse(abandon("runtime"), "exec runtime has no program argument");
      }
      let phaseArgs: readonly string[] = argv.slice(1);
      let phaseEnvironment: Readonly<Record<string, string>> = agentEnvironment;
      if (basename(program) === "codex") {
        const prepared = prepareCodexLaunch(phaseArgs, worktreePath, agentEnvironment, {
          narrate,
          program,
        });
        if (isErr(prepared)) {
          lease.stop();
          return refuse(abandon("runtime"), explainLaunchRefusal(prepared.error));
        }
        phaseArgs = prepared.value.args;
        phaseEnvironment = prepared.value.environment;
        launchCleanup = prepared.value.cleanup;
      }
      const journalDirectory = await sharedJournalDirectory(repoRoot);
      const provider = machine.value.provider;
      if (provider !== "none") {
        const valid = validateExecMachine(provider);
        if (isErr(valid)) {
          lease.stop();
          return refuse(abandon("runtime"), valid.error);
        }
      }
      const admissionFor = (phase: "work" | "debrief") => {
        if (provider === "none") return undefined;
        const token = `${sessionId}/${phase}`;
        const values = (
          extra: Readonly<Record<string, string>> = {},
        ): Readonly<Record<string, string>> => ({
          holder: `${graph}/${node} (${sessionId})`,
          token,
          pane: "",
          workspace: "",
          agent: agentRuntime.name,
          worktree: worktreePath,
          attempt: sessionId,
          session: sessionId,
          phase,
          kind: "exec",
          id: sessionId,
          ...extra,
        });
        const run = async (command: readonly string[]): Promise<Result<void, string>> => {
          const result = await runProviderCommand(command, worktreePath, {
            ...process.env,
            ...machine.value.env,
          });
          return result.code === 0
            ? ok(undefined)
            : err(result.output.split(/\r?\n/)[0] ?? `provider exited ${result.code}`);
        };
        return {
          admit: () => run(providerArgv(provider.admit, values())),
          bind: (identity: {
            readonly pid: number;
            readonly pgid: number;
            readonly birth: string;
            readonly boot: string;
          }) =>
            run(
              providerArgv(
                provider.bind ?? [],
                values({
                  pid: String(identity.pid),
                  pgid: String(identity.pgid),
                  birth: identity.birth,
                  boot: identity.boot,
                }),
              ),
            ),
          release: (outcome: "never-started" | "group-empty" | "override", pgid: string) =>
            run(providerArgv(provider.release, values({ outcome, pgid }))),
        };
      };
      const phaseRequest = (
        phase: "work" | "debrief",
        prompt: string,
        parentId: string | null,
      ): ExecPhaseRequest => {
        const admission = admissionFor(phase);
        return {
          runRoot: execRunRoot(dirname(dirname(journalDirectory))),
          id: sessionId,
          phase,
          phaseId: phase,
          parentId,
          kind: "node",
          graph,
          node,
          runtime: agentRuntime.name,
          model: agentRuntime.model ?? "undeclared",
          program,
          args: phaseArgs,
          prompt,
          promptOnStdin: agentRuntime.prompt === "stdin",
          cwd: worktreePath,
          env: phaseEnvironment,
          timeoutMs: localConfig.runTimeoutMs,
          ...(admission === undefined ? {} : { admission }),
        };
      };
      const scopeBeforeWork = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeBeforeWork)) {
        lease.stop();
        return holdForScopeGuard(
          "work phase",
          `snapshot before phase failed for ${scopeBeforeWork.error.path}: ${scopeBeforeWork.error.because}`,
        );
      }
      const work = await runExecPhase(phaseRequest("work", openingPrompt, null));
      const scopeAfterWork = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeAfterWork)) {
        lease.stop();
        return holdForScopeGuard(
          "work phase",
          `snapshot after phase failed for ${scopeAfterWork.error.path}: ${scopeAfterWork.error.because}`,
        );
      }
      const workChanges = changedScopePaths(scopeBeforeWork.value, scopeAfterWork.value);
      if (workChanges.length > 0) {
        lease.stop();
        return holdForScopeGuard(
          "work phase",
          `changed paths: ${workChanges.map(describeScopeChange).join(", ")}`,
        );
      }
      if (isErr(work)) {
        lease.stop();
        return refuse(abandon("wait"), work.error.because);
      }
      const custody = {
        worktree: worktreePath,
        graph,
        node,
        session: sessionId,
        runtime: agentRuntime.name,
        model: agentRuntime.model,
        ...(request.paths === undefined ? {} : { paths: request.paths }),
      };
      const committedCode =
        agentRuntime.commits === "runner" ? commitRunnerCode(custody) : undefined;
      if (committedCode !== undefined && isErr(committedCode)) {
        lease.stop();
        return refuse(commit("code commit"), committedCode.error);
      }
      const debriefPrompt =
        `The work phase ended at ${work.value.record.endedAt ?? "an unknown head"}. ` +
        `File your debrief and notes now, without committing. Run interlock debrief prepare ${graph} ${node} ` +
        `--to <candidate-path> --agent-runtime ${agentRuntime.name} --agent-model ${agentRuntime.model ?? "undeclared"}; ` +
        "author and file the candidate, then stop.";
      const scopeBeforeDebrief = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeBeforeDebrief)) {
        lease.stop();
        return holdForScopeGuard(
          "debrief phase",
          `snapshot before phase failed for ${scopeBeforeDebrief.error.path}: ${scopeBeforeDebrief.error.because}`,
        );
      }
      const debrief = await runExecPhase(
        phaseRequest("debrief", debriefPrompt, `${sessionId}/work`),
      );
      const scopeAfterDebrief = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeAfterDebrief)) {
        lease.stop();
        return holdForScopeGuard(
          "debrief phase",
          `snapshot after phase failed for ${scopeAfterDebrief.error.path}: ${scopeAfterDebrief.error.because}`,
        );
      }
      const debriefChanges = changedScopePaths(scopeBeforeDebrief.value, scopeAfterDebrief.value);
      if (debriefChanges.length > 0) {
        lease.stop();
        return holdForScopeGuard(
          "debrief phase",
          `changed paths: ${debriefChanges.map(describeScopeChange).join(", ")}`,
        );
      }
      if (isErr(debrief)) {
        lease.stop();
        return refuse(abandon("debrief wait"), debrief.error.because);
      }
      if (committedCode !== undefined && isOk(committedCode)) {
        const committed = await commitRunnerDebrief(custody, committedCode.value);
        if (isErr(committed)) {
          lease.stop();
          return refuse(commit("debrief commit"), committed.error);
        }
        narrate(`debrief committed ${committed.value}`);
      }
      lease.stop();
      const personEventsRead = await readRawEvents(await sharedJournalDirectory(repoRoot));
      const gateIds = declaredGateIds(standingGates, nodeGates);
      const judged = await judgeWorktree({
        machine: machine.value,
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
        onWorktreeRead: async () => {},
      });
      if (isErr(judged)) {
        const message =
          judged.error.kind === "worktree-status"
            ? explainWorktreeRefusal(judged.error.refusal)
            : judged.error.kind === "machine"
              ? judged.error.because
              : explainGateJudgeRefusal(judged.error.refusal);
        return refuse(abandon("gates"), message);
      }
      return {
        exitCode: 0,
        message: `${node}: ${judged.value.kind} (session ${sessionId}, exec phases work/debrief).`,
      };
    }

    const launch = await prepareLaunch(agentRuntime, worktreePath, agentEnvironment, { narrate });
    if (isErr(launch)) {
      const result = refuse(abandon("writable root"), explainLaunchRefusal(launch.error));
      lease.stop();
      abandonLease();
      return result;
    }
    launchCleanup = launch.value.cleanup;

    const openedPane = await runtime.openPane(worktreePath, launch.value.environment);
    if (isErr(openedPane)) {
      const result = refuse(abandon("pane open"), explainRuntimeRefusal(openedPane.error));
      lease.stop();
      abandonLease();
      return result;
    }
    pane = openedPane.value;
    cleanup = {
      session: sessionId,
      hold: {
        token: `${sessionId}/${pane.id}`,
        pane: pane.id,
        cwd: worktreePath,
        release: [],
        env: machine.value.env,
      },
    };
    if (machine.value.provider !== "none") {
      const inspected = await runtime.paneProcess?.(pane);
      if (
        inspected === undefined ||
        isErr(inspected) ||
        inspected.value.state === "gone" ||
        inspected.value.pid === undefined
      ) {
        lease.stop();
        return refuse(
          abandon("pane pid"),
          inspected !== undefined && isErr(inspected)
            ? explainRuntimeRefusal(inspected.error)
            : "no pane process pid is available",
        );
      }
      const values = {
        holder: `${graph}/${node} (${sessionId})`,
        token: cleanup.hold.token,
        pid: String(inspected.value.pid),
        pane: pane.id,
        workspace: pane.workspace ?? "",
        agent: agentRuntime.name,
        worktree: worktreePath,
        attempt: sessionId,
      };
      cleanup = {
        session: sessionId,
        hold: { ...cleanup.hold, release: providerArgv(machine.value.provider.release, values) },
      };
      const admitted = await admitMachine(
        ledger,
        targetNode,
        sessionId,
        cleanup.hold,
        providerArgv(machine.value.provider.admit, values),
      );
      if (isErr(admitted)) {
        lease.stop();
        abandonLease();
        narrate(admitted.error);
        return { exitCode: 1, message: admitted.error };
      }
    }
    narrate(`pane ${pane.id} opened`);
    narrate(
      `runtime ${agentRuntime.name} (${agentRuntime.kind}, ${agentRuntime.model ?? "model undeclared"})`,
    );
    for (const root of launch.value.writableRoots) {
      narrate(`writable root ${root} supplied to runtime ${agentRuntime.name}`);
    }

    const agentIntent =
      machine.value.provider === "none"
        ? undefined
        : machineIntent(ledger, targetNode, sessionId, "agent", cleanup.hold);
    if (agentIntent !== undefined && isErr(agentIntent)) {
      lease.stop();
      return refuse(abandon("agent start"), agentIntent.error);
    }
    const args = launch.value.args;
    const startedAgent = await runtime.startAgent(
      pane,
      agentRuntime.kind,
      args,
      () => narrate("waiting for the pane's shell"),
      node,
    );
    if (isErr(startedAgent)) {
      const result = refuse(abandon("agent start"), explainRuntimeRefusal(startedAgent.error));
      lease.stop();
      abandonLease();
      return result;
    }
    agent = startedAgent.value;
    if (agentIntent !== undefined && isOk(agentIntent)) {
      const saved = machineDelivery(ledger, agentIntent.value, ok({ agent: agent.id }));
      if (isErr(saved)) {
        lease.stop();
        return refuse(abandon("agent start"), saved.error);
      }
    }
    narrate(`agent ${agent.id} started (${agentRuntime.kind})`);
    narrate(`agent argv ${JSON.stringify(args)}`);

    const reported = await runtime.reportIdentity(agent, graph, node, {
      sessionId,
    });
    if (isErr(reported)) {
      const result = refuse(abandon("identity report"), explainRuntimeRefusal(reported.error));
      lease.stop();
      abandonLease();
      return result;
    }
    narrate("identity reported");

    const startupTimeoutMs = agentRuntime.startupTimeoutMs;
    const startupAnswers = agentRuntime.startupAnswers;
    const answered = new Set<number>();
    let startupStatus = await runtime.waitUntil(agent, ["idle", "blocked"], startupTimeoutMs);
    let startupScreen = "";
    while (isOk(startupStatus) && startupStatus.value !== "idle") {
      if (startupStatus.value === "blocked") {
        const screen = await runtime.read(agent);
        if (isErr(screen)) {
          const result = refuse(abandon("startup"), explainRuntimeRefusal(screen.error));
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
          const result = refuse(abandon("startup"), explainRuntimeRefusal(sent.error));
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
      const result = refuse(abandon("startup"), explanation);
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

    const delivered = await deliverOpeningPrompt({
      runtime,
      agent,
      clock,
      narrate,
      prompt: buildOpeningPrompt(
        graph,
        node,
        priorWork,
        role,
        briefWritten.value.openingView,
        shape?.entry.prompt,
        agentRuntime.commits,
      ),
      readySettleMs: agentRuntime.readySettleMs,
      promptRetries: agentRuntime.promptRetries,
      promptTakenTimeoutMs: agentRuntime.promptTakenTimeoutMs,
      answerGraceMs: localConfig.answerGraceMs,
      startupAnswers: agentRuntime.startupAnswers,
    });
    if (isErr(delivered)) {
      const result = refuse(abandon("prompt"), explainRuntimeRefusal(delivered.error));
      lease.stop();
      abandonLease();
      return result;
    }
    paneCustody = "person";
    const delivery = delivered.value;

    const readUnfinishedWork = (): UnfinishedWork | undefined => {
      if (agentRuntime.commits === "runner") return undefined;
      const dirty = uncommittedPaths(worktreePath);
      const dirtyCount = isOk(dirty) ? dirty.value.length : 0;
      const debriefRelative = relative(worktreePath, debriefFilePath(worktreePath, graph, node));
      const debriefMissing = !isCommittedAtHead(worktreePath, debriefRelative);
      return dirtyCount === 0 && !debriefMissing
        ? undefined
        : { uncommittedPaths: dirtyCount, debriefMissing };
    };

    const observing = runtime;
    const identity = { graph, node, session: sessionId };
    const observe = async () => (await observeRuntime(observing)).attempt(identity);
    const scopeBeforeWork = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
    if (isErr(scopeBeforeWork)) {
      lease.stop();
      return holdForScopeGuard(
        "work turn",
        `snapshot before phase failed for ${scopeBeforeWork.error.path}: ${scopeBeforeWork.error.because}`,
      );
    }
    if (delivery.kind === "abandoned") {
      narrate("judging the abandoned delivery once the agent's work is shown finished");
    } else {
      narrate(`waiting for idle, blocked or done (timeout ${localConfig.runTimeoutMs}ms)`);
    }
    const deadline = deadlineFrom(clock.now().monoMs, ms(localConfig.runTimeoutMs));
    const waited = await waitForSession(
      runtime,
      agent,
      observe,
      clock,
      deadline,
      localConfig.runTimeoutMs,
      localConfig.answerGraceMs,
      narrate,
      readUnfinishedWork,
      () => recordQuestionNotes(ledger, sessionId, worktreePath, targetNode),
      delivery.kind === "abandoned" ? { alreadySettled: "idle" } : {},
    );
    const scopeAfterWork = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
    if (isErr(scopeAfterWork)) {
      lease.stop();
      return holdForScopeGuard(
        "work turn",
        `snapshot after phase failed for ${scopeAfterWork.error.path}: ${scopeAfterWork.error.because}`,
      );
    }
    const workChanges = changedScopePaths(scopeBeforeWork.value, scopeAfterWork.value);
    if (workChanges.length > 0) {
      lease.stop();
      return holdForScopeGuard(
        "work turn",
        `changed paths: ${workChanges.map(describeScopeChange).join(", ")}`,
      );
    }
    if (isErr(waited)) {
      lease.stop();
      const result = refuse(abandon("wait"), explainRuntimeRefusal(waited.error));
      abandonLease();
      return result;
    }

    if (agentRuntime.commits === "runner") {
      const custody = {
        worktree: worktreePath,
        graph,
        node,
        session: sessionId,
        runtime: agentRuntime.name,
        model: agentRuntime.model,
        ...(request.paths === undefined ? {} : { paths: request.paths }),
      };
      const code = commitRunnerCode(custody);
      if (isErr(code)) {
        lease.stop();
        return refuse(commit("code commit"), code.error);
      }
      const scopeBeforeDebrief = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeBeforeDebrief)) {
        lease.stop();
        return holdForScopeGuard(
          "debrief prompt",
          `snapshot before phase failed for ${scopeBeforeDebrief.error.path}: ${scopeBeforeDebrief.error.because}`,
        );
      }
      const sent = await runtime.prompt(
        agent,
        `Your code is committed at ${code.value.head}. File your debrief and notes now, without committing. ` +
          `Run interlock debrief prepare ${graph} ${node} --to <candidate-path> --agent-runtime ${agentRuntime.name} --agent-model ${agentRuntime.model ?? "undeclared"}; author and file the candidate. ` +
          `head_sha must be ${code.value.head}. Leave all candidates and sources in the session directory. Stop when filed.`,
      );
      if (isErr(sent)) {
        lease.stop();
        return refuse(abandon("debrief prompt"), explainRuntimeRefusal(sent.error));
      }
      const taken = await runtime.waitUntil(
        agent,
        ["working", "blocked", "done"],
        agentRuntime.promptTakenTimeoutMs,
      );
      if (isErr(taken)) {
        lease.stop();
        return refuse(abandon("debrief prompt"), explainRuntimeRefusal(taken.error));
      }
      const filed = await waitForSession(
        runtime,
        agent,
        observe,
        clock,
        deadlineFrom(clock.now().monoMs, ms(localConfig.runTimeoutMs)),
        localConfig.runTimeoutMs,
        localConfig.answerGraceMs,
        narrate,
        () =>
          existsSync(debriefFilePath(worktreePath, graph, node))
            ? undefined
            : { uncommittedPaths: 0, debriefMissing: true },
        () => recordQuestionNotes(ledger, sessionId, worktreePath, targetNode),
      );
      const scopeAfterDebrief = snapshotScope(worktreePath, localConfig.watchPaths ?? []);
      if (isErr(scopeAfterDebrief)) {
        lease.stop();
        return holdForScopeGuard(
          "debrief prompt",
          `snapshot after phase failed for ${scopeAfterDebrief.error.path}: ${scopeAfterDebrief.error.because}`,
        );
      }
      const debriefChanges = changedScopePaths(scopeBeforeDebrief.value, scopeAfterDebrief.value);
      if (debriefChanges.length > 0) {
        lease.stop();
        return holdForScopeGuard(
          "debrief prompt",
          `changed paths: ${debriefChanges.map(describeScopeChange).join(", ")}`,
        );
      }
      if (isErr(filed)) {
        lease.stop();
        return refuse(abandon("debrief wait"), explainRuntimeRefusal(filed.error));
      }
      const committed = await commitRunnerDebrief(custody, code.value);
      if (isErr(committed)) {
        lease.stop();
        return refuse(commit("debrief commit"), committed.error);
      }
      narrate(`debrief committed ${committed.value}`);
    }
    lease.stop();

    const screenRead = await runtime.read(agent);
    if (isErr(screenRead)) {
      narrate(`agent screen read refused: ${explainRuntimeRefusal(screenRead.error)}`);
    }

    const onWorktreeRead = async (): Promise<void> => {
      if (!isOk(screenRead)) return;
      if (
        agentRuntime.commits === "agent" ||
        isIgnoredPath(worktreePath, `.interlock/sessions/${graph}/${node}/screen.txt`)
      ) {
        await writeScreenSnapshot(worktreePath, graph, node, screenRead.value);
      }
      narrate(`agent screen: ${lastNonEmptyLine(screenRead.value) ?? "(no output)"}`);
    };

    const personEventsRead = await readRawEvents(await sharedJournalDirectory(repoRoot));

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
        const result = refuse(abandon("graph"), preCheck.error.because);
        abandonLease();
        return result;
      }
    }

    const judged = await judgeWorktree({
      machine: machine.value,
      ledger,
      clock,
      node: targetNode,
      session: sessionId,
      declaredGateIds: gateIds,
      commandFor: gateCommandTable(standingGates, nodeGates),
      worktree: worktreePath,
      authoritativeGraphPath:
        request.authoritativeGraphPath ?? join(repoRoot, ".interlock", "graphs", `${graph}.yaml`),
      ...(request.parsedGraphHash === undefined
        ? {}
        : { parsedGraphHash: request.parsedGraphHash }),
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
          ? refuse(abandon("worktree status"), explainWorktreeRefusal(judged.error.refusal))
          : judged.error.kind === "machine"
            ? refuse(abandon("gates"), judged.error.because)
            : refuse(abandon("gates"), explainGateJudgeRefusal(judged.error.refusal));
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
  };
  let result: DriveSessionOutcome;
  let closeFailure: DriveSessionOutcome | undefined;
  try {
    result = await drive();
  } finally {
    stopLease?.();
    if (pane !== undefined && runtime !== undefined) {
      if (paneCustody === "runner") {
        const closed =
          cleanup === undefined || cleanup.hold.release.length === 0
            ? await closeWithoutProvider(runtime, pane)
            : await closeMachinePane(
                ledger,
                runtime,
                { graph, id: node },
                cleanup.session,
                cleanup.hold,
              );
        if (isErr(closed)) {
          const because = `pane ${pane.id} close or machine release unconfirmed; hold kept: ${closed.error}`;
          narrate(because);
          ledger.append({
            kind: "outcome-set",
            node: { graph, id: node },
            outcome: outcome.held(
              ledger.projection().nodes.get(nodeKey({ graph, id: node }))?.receipts ?? [],
              heldOn.gateFailure("pane close", "hold"),
              because,
              clock.now().wallMs + HELD_REVISIT_MS,
            ),
          });
          closeFailure = { exitCode: 1, message: because };
        }
      } else {
        narrate(`pane ${pane.id} left open for drilldown`);
      }
    }
    launchCleanup?.();
    launchCleanup = undefined;
  }
  return closeFailure ?? result;
}

async function closeWithoutProvider(runtime: Runtime, pane: Pane): Promise<Result<void, string>> {
  const closed = await runtime.closePane(pane);
  return isErr(closed) ? err(explainRuntimeRefusal(closed.error)) : closed;
}
