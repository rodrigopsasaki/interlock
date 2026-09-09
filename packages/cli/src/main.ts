import { validateDebrief } from "./debrief/validate.ts";

export interface CommandResult {
  readonly exitCode: number;
  readonly message: string;
}

export function run(argv: readonly string[]): CommandResult {
  const [group, action] = argv;

  if (group === "debrief" && action === "validate") {
    const outcome = validateDebrief();
    return { exitCode: 1, message: outcome.reason };
  }

  return { exitCode: 1, message: `interlock: unknown command "${argv.join(" ")}"` };
}
