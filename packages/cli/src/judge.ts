import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  approvalState,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocumentText,
  sharedJournalDirectory,
} from "face";
import {
  createLedger,
  explainScopeRefusal,
  fileScope,
  nodeKey,
  readRawEvents,
  receiptId,
} from "ledger";
import {
  decidedNodeRefusal,
  declaredGateIds,
  explainJudgeWorktreeRefusal,
  explainLocalConfigRefusal,
  explainStandingGatesRefusal,
  type GateCommandRunner,
  gateCommandTable,
  HELD_REVISIT_MS,
  judgeWorktree,
  loadLocalConfig,
  loadStandingGates,
  recordingNarrate,
  resolveMachine,
} from "runner";
import {
  commandRunnerWithDeadline,
  createJudgeDeadline,
  deadlineMessage,
  type HeldLease,
  JudgeDeadlineExceeded,
  leaseDeadlineMessage,
  resolveJudgeTimeout,
  waitForHeldLease,
} from "../../runner/src/deadline.ts";
import type { CommandResult } from "./main.ts";
import { substrateClientForRepository } from "./repositoryOrigin.ts";

function isoOf(wallMs: number): string {
  return new Date(wallMs).toISOString();
}

function sessionOverrideFrom(args: readonly string[]): string | undefined {
  const flagIndex = args.indexOf("--session");
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

export async function runInterlockJudge(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly commandRunner?: GateCommandRunner;
    readonly outputDirectory?: string;
    readonly narrate?: (line: string) => void;
    readonly scopeGuardRecheck?: boolean;
  } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock judge: expected a graph id and a node id, e.g. "interlock judge 0001-bootstrap verifier-hunks".',
    };
  }

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

  const timeout = resolveJudgeTimeout(args, graphBytes.toString("utf-8"));
  if (timeout.kind === "refused") return { exitCode: 1, message: timeout.message };

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

  const journal = await sharedJournalDirectory(repoRoot);
  const clock = options.clock ?? createSystemClock();
  const deadline = createJudgeDeadline(timeout.minutes, () => clock.now().wallMs);
  const opened = await createLedger({ clock, directory: journal });
  if (isErr(opened)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${opened.error.line} has shape tag "${opened.error.tag}", which this build does not recognize.`,
    };
  }
  const ledger = opened.value;

  try {
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
        message: `${graph}: graph is ${approval}, not approved for its current content; refusing to judge "${node}".`,
      };
    }

    const decided = decidedNodeRefusal(graph, node, ledger.projection());
    if (decided !== undefined) return { exitCode: 1, message: decided };

    const worktreePath = join(repoRoot, localConfig.value.worktreeRoot, node);
    if (!existsSync(worktreePath)) {
      return {
        exitCode: 1,
        message: `${worktreePath}: no worktree there; nothing for judge to read.`,
      };
    }

    const targetNode = { graph, id: node };
    const nodeSessions = [...ledger.projection().sessions.values()].filter(
      (session) => session.node.graph === graph && session.node.id === node,
    );

    const latestSession = nodeSessions[nodeSessions.length - 1];
    const sessionId = sessionOverrideFrom(args) ?? latestSession?.session;
    if (sessionId === undefined) {
      return {
        exitCode: 1,
        message: `${node}: no session recorded for this node; name one with --session <id>.`,
      };
    }
    narrate = recordingNarrate(ledger, clock, sessionId, narrate);

    const nowWallMs = clock.now().wallMs;
    const liveLease = nodeSessions.find(
      (session) =>
        session.lease !== undefined && !session.leaseExpired && session.lease.expiry > nowWallMs,
    );
    if (liveLease?.lease !== undefined) {
      if (latestSession?.startedAt.state !== "known") {
        const line =
          `${node} is leased by session ${liveLease.lease.session} until ${isoOf(liveLease.lease.expiry)}; ` +
          "the lease start is unknown, so wait for it or run interlock sweep.";
        narrate(line);
        return { exitCode: 1, message: line };
      }
      let observedLease: HeldLease | undefined = {
        session: liveLease.lease.session,
        since:
          latestSession?.startedAt.state === "known"
            ? isoOf(latestSession.startedAt.epochMs)
            : "unknown",
      };
      const waited = await waitForHeldLease(
        deadline,
        async () => {
          const events = await readRawEvents(journal);
          if (isErr(events)) return observedLease;
          let current: { readonly session: string; readonly expiry: number } | undefined;
          const startedAt = new Map<string, number | undefined>();
          for (const event of events.value) {
            if (event.kind === "session-started") {
              startedAt.set(event.session.id, event.startedAt);
            } else if (
              (event.kind === "lease-taken" || event.kind === "lease-renewed") &&
              event.node.graph === graph &&
              event.node.id === node
            ) {
              current = { session: event.session, expiry: event.expiry };
            } else if (
              event.kind === "lease-expired" &&
              event.node.graph === graph &&
              event.node.id === node &&
              current?.session === event.session
            ) {
              current = undefined;
            }
          }
          if (current === undefined || current.expiry <= clock.now().wallMs) {
            observedLease = undefined;
            return undefined;
          }
          const started = startedAt.get(current.session);
          observedLease = {
            session: current.session,
            since: started === undefined ? "unknown" : isoOf(started),
          };
          return observedLease;
        },
        narrate,
        (milliseconds) => clock.sleep(milliseconds),
      );
      if (waited === "deadline") {
        const line = leaseDeadlineMessage(timeout.minutes);
        narrate(line);
        return { exitCode: 1, message: line };
      }
    }
    const gateIds = declaredGateIds(standingGates.value, declaration.gates);
    const commands = gateCommandTable(standingGates.value, declaration.gates);
    const commandGateIds = gateIds.filter((gateId) => {
      const command = commands.get(gateId);
      if (command?.kind === "human") return false;
      const current = ledger.projection().nodes.get(nodeKey(targetNode))?.gates.get(gateId);
      return !(current?.kind === "satisfied" && current.receipt.spend.kind !== "none");
    });
    const personEventsRead = await readRawEvents(journal);
    let judged: Awaited<ReturnType<typeof judgeWorktree>>;
    try {
      judged = await judgeWorktree({
        machine: machine.value,
        ledger,
        clock,
        node: targetNode,
        session: sessionId,
        declaredGateIds: gateIds,
        commandFor: commands,
        worktree: worktreePath,
        authoritativeGraphPath: graphPath,
        parsedGraphHash: createHash("sha256").update(graphBytes).digest("hex"),
        narrate,
        runnerId: `judge-${sessionId}`,
        holdMs: HELD_REVISIT_MS,
        substrate,
        personEvents: isErr(personEventsRead) ? [] : personEventsRead.value,
        commandRunner: commandRunnerWithDeadline(deadline, commandGateIds, options.commandRunner),
        ...(options.outputDirectory === undefined
          ? {}
          : { outputDirectory: options.outputDirectory }),
        scopeGuardRecheck:
          options.scopeGuardRecheck === true ||
          args.includes("--scope-guard-recheck") ||
          args.includes("--scope-guard-rerun") ||
          args.includes("--recheck-scope"),
        watchPaths: localConfig.value.watchPaths ?? [],
      });
    } catch (error) {
      if (!(error instanceof JudgeDeadlineExceeded)) throw error;
      const line = deadlineMessage(timeout.minutes, error.gateId);
      narrate(line);
      return { exitCode: 1, message: line };
    }
    if (isErr(judged)) {
      const line = `judge refused: ${explainJudgeWorktreeRefusal(judged.error)}`;
      narrate(line);
      return { exitCode: 1, message: line };
    }

    return {
      exitCode: 0,
      message: `${node}: ${judged.value.kind} (session ${sessionId}, judged by hand)`,
    };
  } finally {
    await ledger.close();
  }
}
