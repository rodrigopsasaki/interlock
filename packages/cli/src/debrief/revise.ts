import { isErr } from "@phyxiusjs/fp";
import { explainDebriefRevisionRefusal, reviseDebrief } from "debrief";
import { findRepoRoot } from "face";
import { parseFlag } from "../flags.ts";
import type { CommandResult } from "../main.ts";
import { recoverSessionStart } from "./recoverSessionStart.ts";

export async function runDebriefRevise(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock debrief revise: expected a graph id and node id, e.g. "interlock debrief revise 0001-bootstrap debrief-schema --from <candidate-path>".',
    };
  }
  const candidate = parseFlag(args, "--from");
  if (candidate === undefined) {
    return {
      exitCode: 1,
      message: "interlock debrief revise: refuses without --from <candidate-path>.",
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
  const revised = await reviseDebrief(repoRoot, graph, node, candidate, {
    ...(args.includes("--recover-session-start") ? { recoverSessionStart } : {}),
  });
  if (isErr(revised)) {
    return { exitCode: 1, message: explainDebriefRevisionRefusal(revised.error) };
  }
  if (revised.value.kind === "already-current") {
    return {
      exitCode: 0,
      message: `${graph}/${node}: already current; canonical ${revised.value.currentPath}, source ${revised.value.candidatePath}.`,
    };
  }
  return {
    exitCode: 0,
    message: `${graph}/${node}: selected; current ${revised.value.currentPath}, retained ${revised.value.archivePath}, source ${revised.value.candidatePath}.`,
  };
}
