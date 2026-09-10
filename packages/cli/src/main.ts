import { runInterlockBackfill } from "./backfill.ts";
import { validateDebrief } from "./debrief/validate.ts";
import { runGraphApprove } from "./graph/approve.ts";
import { runGraphShow } from "./graph/show.ts";
import { runInterlockRun } from "./run.ts";
import { runInterlockSweep } from "./sweep.ts";

export interface CommandResult {
  readonly exitCode: number;
  readonly message: string;
}

export async function run(argv: readonly string[]): Promise<CommandResult> {
  const [group, action] = argv;

  if (group === "debrief" && action === "validate") {
    const outcome = validateDebrief();
    return { exitCode: 1, message: outcome.reason };
  }

  if (group === "graph" && action === "show") {
    return runGraphShow(argv.slice(2));
  }

  if (group === "graph" && action === "approve") {
    return runGraphApprove(argv.slice(2));
  }

  if (group === "run") {
    return runInterlockRun(argv.slice(1));
  }

  if (group === "sweep") {
    return runInterlockSweep(argv.slice(1));
  }

  if (group === "backfill") {
    return runInterlockBackfill(argv.slice(1));
  }

  return {
    exitCode: 1,
    message: `interlock: unknown command "${argv.join(" ")}"`,
  };
}
