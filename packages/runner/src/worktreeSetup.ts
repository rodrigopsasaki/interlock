import { spawn } from "node:child_process";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";

export type WorktreeSetupRefusal = {
  readonly kind: "command-failed";
  readonly command: string;
  readonly exitCode: number;
};

export function explainWorktreeSetupRefusal(refusal: WorktreeSetupRefusal): string {
  return `"${refusal.command}" exited ${refusal.exitCode}.`;
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

export function runSetupCommand(
  command: string,
  cwd: string,
): Promise<Result<void, WorktreeSetupRefusal>> {
  return new Promise((resolve) => {
    const tokens = tokenize(command);
    if (tokens.length === 0) {
      resolve(err({ kind: "command-failed", command, exitCode: -1 }));
      return;
    }
    const child = spawn("mise", ["exec", "--", ...tokens], {
      cwd,
      stdio: "ignore",
    });
    child.on("close", (code) => {
      const exitCode = code ?? -1;
      resolve(exitCode === 0 ? ok(undefined) : err({ kind: "command-failed", command, exitCode }));
    });
  });
}

export async function runWorktreeSetup(
  commands: readonly string[],
  worktreePath: string,
  narrate: (line: string) => void,
): Promise<Result<void, WorktreeSetupRefusal>> {
  for (const command of commands) {
    narrate(`worktree setup: ${command}`);
    const setup = await runSetupCommand(command, worktreePath);
    if (isErr(setup)) return setup;
  }
  return ok(undefined);
}
