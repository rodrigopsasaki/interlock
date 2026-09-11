import { runInterlockBackfill } from "./backfill.ts";
import { validateBrief } from "./brief/validate.ts";
import { validateDebrief } from "./debrief/validate.ts";
import { runInterlockFace } from "./face/run.ts";
import { runGateWaive } from "./gate/waive.ts";
import { runGraphApprove } from "./graph/approve.ts";
import { runGraphShow } from "./graph/show.ts";
import { runInterlockJudge } from "./judge.ts";
import { runNodeCancel } from "./node/cancel.ts";
import { runNodeReset } from "./node/reset.ts";
import { runInterlockRun } from "./run.ts";
import { runSchemaValidate } from "./schema/validate.ts";
import { runSessionShow } from "./session/show.ts";
import { runInterlockSweep } from "./sweep.ts";
import { runInterlockVerify } from "./verify.ts";

export interface CommandResult {
  readonly exitCode: number;
  readonly message: string;
}

export async function run(argv: readonly string[]): Promise<CommandResult> {
  const [group, action] = argv;

  if (group === "debrief" && action === "validate") {
    return validateDebrief(argv.slice(2));
  }

  if (group === "brief" && action === "validate") {
    return validateBrief(argv.slice(2));
  }

  if (group === "graph" && action === "show") {
    return runGraphShow(argv.slice(2));
  }

  if (group === "graph" && action === "approve") {
    return runGraphApprove(argv.slice(2));
  }

  if (group === "session" && action === "show") {
    return runSessionShow(argv.slice(2));
  }

  if (group === "node" && action === "cancel") {
    return runNodeCancel(argv.slice(2));
  }

  if (group === "node" && action === "reset") {
    return runNodeReset(argv.slice(2));
  }

  if (group === "gate" && action === "waive") {
    return runGateWaive(argv.slice(2));
  }

  if (group === "schema" && action === "validate") {
    return runSchemaValidate(argv.slice(2));
  }

  if (group === "run") {
    return runInterlockRun(argv.slice(1));
  }

  if (group === "judge") {
    return runInterlockJudge(argv.slice(1));
  }

  if (group === "sweep") {
    return runInterlockSweep(argv.slice(1));
  }

  if (group === "backfill") {
    return runInterlockBackfill(argv.slice(1));
  }

  if (group === "verify") {
    return runInterlockVerify(argv.slice(1));
  }

  if (group === "face") {
    return runInterlockFace(argv.slice(1));
  }

  return {
    exitCode: 1,
    message: `interlock: unknown command "${argv.join(" ")}"`,
  };
}
