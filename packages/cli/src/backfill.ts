import { type Clock, createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  loadGraphDocument,
  sharedJournalDirectory,
} from "face";
import { createLedger } from "ledger";
import {
  backfillGraph,
  explainBackfillRefusal,
  explainLocalConfigRefusal,
  explainStandingGatesRefusal,
  loadLocalConfig,
  loadStandingGates,
} from "runner";
import type { CommandResult } from "./main.ts";

export async function runInterlockBackfill(
  args: readonly string[],
  options: {
    readonly cwd?: string;
    readonly clock?: Clock;
    readonly mainBranch?: string;
    readonly narrate?: (line: string) => void;
  } = {},
): Promise<CommandResult> {
  const [graph] = args;
  if (graph === undefined) {
    return {
      exitCode: 1,
      message: 'interlock backfill: expected a graph id, e.g. "interlock backfill 0001-bootstrap".',
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

  const document = await loadGraphDocument(graphFilePath(repoRoot, graph));
  if (isErr(document)) {
    return { exitCode: 1, message: explainGraphRefusal(document.error) };
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
  const narrate =
    options.narrate ??
    ((line: string) => {
      process.stdout.write(`${line}\n`);
    });

  try {
    const backfilled = await backfillGraph({
      repoRoot,
      mainBranch: options.mainBranch ?? "main",
      document: document.value,
      ledger,
      clock,
      standingGates: standingGates.value,
      worktreeRoot: localConfig.value.worktreeRoot,
      worktreeSetup: localConfig.value.worktreeSetup,
      narrate,
    });
    if (isErr(backfilled)) {
      return { exitCode: 1, message: explainBackfillRefusal(backfilled.error) };
    }
    if (backfilled.value.length === 0) {
      return {
        exitCode: 0,
        message: `${graph}: no debriefed, dependency-cleared node needed backfilling.`,
      };
    }
    const lines = backfilled.value.map((result) => `${result.node}: ${result.outcome.kind}`);
    return {
      exitCode: 0,
      message: [`${graph}: backfilled ${backfilled.value.length} node(s).`, ...lines].join("\n"),
    };
  } finally {
    await ledger.close();
  }
}
