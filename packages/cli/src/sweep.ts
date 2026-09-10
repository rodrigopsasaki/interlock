import { createSystemClock, type Clock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import { findRepoRoot, sharedJournalDirectory } from "face";
import { createLedger } from "ledger";
import { sweepExpiredLeases } from "runner";
import type { CommandResult } from "./main.ts";

export async function runInterlockSweep(
  _args: readonly string[],
  options: { readonly cwd?: string; readonly clock?: Clock } = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
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
    const abandoned = sweepExpiredLeases(ledger, clock.now().wallMs);
    return {
      exitCode: 0,
      message:
        abandoned.length === 0
          ? "sweep: no expired, unresolved leases."
          : `sweep: abandoned ${abandoned.length} session(s): ${abandoned.join(", ")}.`,
    };
  } finally {
    await ledger.close();
  }
}
