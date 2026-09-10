import { validateDebrief } from "./debrief/validate.ts";
import { runGraphApprove } from "./graph/approve.ts";
import { runGraphShow } from "./graph/show.ts";

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

  return {
    exitCode: 1,
    message: `interlock: unknown command "${argv.join(" ")}"`,
  };
}
