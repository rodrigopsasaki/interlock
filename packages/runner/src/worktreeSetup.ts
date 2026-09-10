import { spawn } from "node:child_process";
import { err, ok, type Result } from "@phyxiusjs/fp";

export type WorktreeSetupRefusal = {
  readonly kind: "command-failed";
  readonly command: string;
  readonly exitCode: number;
};

export function explainWorktreeSetupRefusal(
  refusal: WorktreeSetupRefusal,
): string {
  return `"${refusal.command}" exited ${refusal.exitCode}.`;
}

function tokenize(command: string): readonly string[] {
  return command.split(/\s+/).filter((token) => token.length > 0);
}

// Runs through the same pinned-toolchain invocation the gates use, so a node's worktree never
// depends on whatever happens to be on this machine's PATH.
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
      resolve(
        exitCode === 0
          ? ok(undefined)
          : err({ kind: "command-failed", command, exitCode }),
      );
    });
  });
}
