import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { createSystemClock, type Clock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
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
  declaredGateIds,
  explainJudgeWorktreeRefusal,
  explainLocalConfigRefusal,
  explainStandingGatesRefusal,
  gateCommandTable,
  HELD_REVISIT_MS,
  judgeWorktree,
  loadLocalConfig,
  loadStandingGates,
  recordingNarrate,
} from "runner";
import { substrateClientFor } from "substrate";
import type { CommandResult } from "./main.ts";

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
    readonly narrate?: (line: string) => void;
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
        message: `${graph}: graph is ${approval}, not approved for its current content; refusing to judge "${node}".`,
      };
    }

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

    const nowWallMs = clock.now().wallMs;
    const liveLease = nodeSessions.find(
      (session) =>
        session.lease !== undefined &&
        !session.leaseExpired &&
        session.lease.expiry > nowWallMs,
    );
    if (liveLease?.lease !== undefined) {
      return {
        exitCode: 1,
        message: `${node} is leased by session ${liveLease.session} until ${isoOf(liveLease.lease.expiry)}; wait for it or run interlock sweep.`,
      };
    }

    const latestSession = nodeSessions[nodeSessions.length - 1];
    const sessionId = sessionOverrideFrom(args) ?? latestSession?.session;
    if (sessionId === undefined) {
      return {
        exitCode: 1,
        message: `${node}: no session recorded for this node; name one with --session <id>.`,
      };
    }
    narrate = recordingNarrate(ledger, clock, sessionId, narrate);

    const gateIds = declaredGateIds(standingGates.value, declaration.gates);
    const judged = await judgeWorktree({
      ledger,
      clock,
      node: targetNode,
      session: sessionId,
      declaredGateIds: gateIds,
      commandFor: gateCommandTable(standingGates.value, declaration.gates),
      worktree: worktreePath,
      narrate,
      runnerId: `judge-${sessionId}`,
      holdMs: HELD_REVISIT_MS,
      substrate,
    });
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
