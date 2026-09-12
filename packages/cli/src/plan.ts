import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import { readBriefFile, renderSlice } from "debrief";
import {
  approvalState,
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
  type Ledger,
  nodeKey,
  type Outcome,
  receiptId,
} from "ledger";
import {
  authoritativeBriefGates,
  type BeforeJudgeRefusal,
  type BriefWriteOutcome,
  driveInteractiveSession,
  explainLocalConfigRefusal,
  explainStandingGatesRefusal,
  extractAsk,
  gitTrackedFiles,
  type InterpreterCorrection,
  interpreterBriefBody,
  loadLocalConfig,
  loadStandingGates,
  type Runtime,
  renderBriefFile,
} from "runner";
import { narrateContext, substrateClientFor } from "substrate";
import { parseFlag } from "./flags.ts";
import type { CommandResult } from "./main.ts";

const USAGE =
  'interlock plan: expected a graph id and --ask, e.g. "interlock plan 0004-example ' +
  '--ask "<text>" [--correction "<reason>"]".';

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

async function readIfExists(path: string): Promise<Result<string | undefined, string>> {
  try {
    return ok(await readFile(path, "utf-8"));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return ok(undefined);
    return err(error instanceof Error ? error.message : String(error));
  }
}

async function refuseIfGraphApproved(
  repoRoot: string,
  graph: string,
  ledger: Ledger,
): Promise<Result<void, string>> {
  const path = graphFilePath(repoRoot, graph);
  if (!existsSync(path)) return ok(undefined);
  const contentHash = await receiptId(repoRoot, [relative(repoRoot, path)], "approved");
  if (isErr(contentHash)) return err(explainScopeRefusal(contentHash.error));
  const graphNode = { graph, id: graph };
  const approvalGate = ledger.projection().nodes.get(nodeKey(graphNode))?.gates.get("approved");
  const approval = approvalState(approvalGate, contentHash.value);
  if (approval !== "approved") return ok(undefined);
  return err(
    `${path}: graph is approved for its current content; interlock plan does not touch an approved graph.`,
  );
}

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
  const correctionReason = parseFlag(args, "--correction");
  if (ask === undefined && correctionReason === undefined) {
    return {
      exitCode: 1,
      message: "interlock plan: refuses without --ask; a plan needs a request to interpret.",
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

  const standingGates = await loadStandingGates(repoRoot);
  if (isErr(standingGates)) {
    return {
      exitCode: 1,
      message: explainStandingGatesRefusal(standingGates.error),
    };
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

  try {
    const approvalRefusal = await refuseIfGraphApproved(repoRoot, graph, ledger);
    if (isErr(approvalRefusal)) {
      return { exitCode: 1, message: approvalRefusal.error };
    }

    let resolvedAsk = ask;
    let correction: InterpreterCorrection | undefined;

    const afterWorktree = async (worktreePath: string): Promise<Result<void, string>> => {
      const worktreeGraphPath = graphFilePath(worktreePath, graph);
      const previousGraphYaml = await readIfExists(worktreeGraphPath);
      if (isErr(previousGraphYaml)) return err(previousGraphYaml.error);

      if (previousGraphYaml.value === undefined && correctionReason !== undefined) {
        return err(
          `${worktreeGraphPath}: no such file; --correction reopens an existing graph, not a new one.`,
        );
      }
      if (previousGraphYaml.value !== undefined && correctionReason === undefined) {
        return err(
          `${worktreeGraphPath}: a graph already exists for "${graph}"; use --correction "<reason>" to reopen it.`,
        );
      }
      if (correctionReason !== undefined && previousGraphYaml.value !== undefined) {
        correction = { reason: correctionReason, previousGraphYaml: previousGraphYaml.value };
      }

      if (resolvedAsk === undefined) {
        const previousBriefPath = join(
          worktreePath,
          ".interlock",
          "sessions",
          graph,
          node,
          "brief.md",
        );
        const previousBrief = await readBriefFile(previousBriefPath);
        if (isErr(previousBrief) || previousBrief.value.kind !== "v1") {
          return err(
            `${previousBriefPath}: no previous brief to carry an ask from; pass --ask explicitly.`,
          );
        }
        const recoveredAsk = extractAsk(previousBrief.value.body);
        if (recoveredAsk === undefined) {
          return err(
            `${previousBriefPath}: no previous ask found to carry forward; pass --ask explicitly.`,
          );
        }
        resolvedAsk = recoveredAsk;
      }

      return ok(undefined);
    };

    const composeBrief = async (
      worktreePath: string,
      graphBaseSha: string,
      session: string,
    ): Promise<Result<BriefWriteOutcome, string>> => {
      const narration: string[] = [];
      if (correction !== undefined) narration.push(`correction: ${correction.reason}`);

      const scope = gitTrackedFiles(repoRoot);
      const contextOutcome = await substrate.context(targetNode, scope, "interpreter");
      narration.push(narrateContext(substrate.address, contextOutcome));
      const contextSlice =
        contextOutcome.kind === "rendered"
          ? renderSlice(substrate.address, contextOutcome.items)
          : undefined;

      if (resolvedAsk === undefined) {
        return err("interlock plan: no ask resolved; refusing to compose a brief without one.");
      }

      const body = interpreterBriefBody(graph, node, resolvedAsk, contextSlice, correction);
      const content = renderBriefFile(
        {
          graph,
          node,
          role: "interpreter",
          gates: authoritativeBriefGates(standingGates.value, []),
          scope,
          substrate: { address: substrate.address },
          runner: { kind: "worktree", graphBaseSha, session },
        },
        body,
      );

      const destination = join(worktreePath, ".interlock", "sessions", graph, node, "brief.md");
      try {
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content, "utf-8");
      } catch (error) {
        return err(`${destination}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return ok({ path: destination, narration });
    };

    const beforeJudge = async (worktreePath: string): Promise<Result<void, BeforeJudgeRefusal>> => {
      const path = graphFilePath(worktreePath, graph);
      const loaded = await loadGraphDocument(path);
      if (isErr(loaded)) {
        const because = explainGraphRefusal(loaded.error);
        return err({ on: heldOn.gateFailure(because, "repair"), because });
      }
      if (loaded.value.id !== graph) {
        const because = `${path}: graph "id" is "${loaded.value.id}", expected "${graph}".`;
        return err({ on: heldOn.gateFailure(because, "repair"), because });
      }
      return ok(undefined);
    };

    const describeDone = (_kind: Outcome["kind"], done: (line: string) => void): string => {
      done(`${graph}: graph landed not approved`);
      return `${graph} landed not approved.`;
    };

    const acceptance =
      `Produce .interlock/graphs/${graph}.yaml, a graph@v0 document derived from the ask, ` +
      "and a debrief; never lease or run a node of the graph.";

    return await driveInteractiveSession({
      repoRoot,
      graph,
      node,
      role: "interpreter",
      acceptance,
      nodeGates: [],
      localConfig: localConfig.value,
      standingGates: standingGates.value,
      substrate,
      ledger,
      clock,
      narrate,
      ...(options.runtime === undefined ? {} : { runtime: options.runtime }),
      runnerIdPrefix: "plan",
      afterWorktree,
      composeBrief,
      beforeJudge,
      describeDone,
    });
  } finally {
    await ledger.close();
  }
}
