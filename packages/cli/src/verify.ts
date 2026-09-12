import { existsSync } from "node:fs";
import { isErr } from "@phyxiusjs/fp";
import { DEBRIEF_V2, debriefFilePath, explainDebriefRefusal, readDebriefFile } from "debrief";
import { findRepoRoot } from "face";
import { explainVerifyRefusal, renderVerification, verifyDebrief } from "verifier";
import type { CommandResult } from "./main.ts";

const USAGE =
  'interlock verify: expected a graph id and a node id, e.g. "interlock verify 0001-bootstrap debrief-schema".';

export async function runInterlockVerify(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return { exitCode: 1, message: USAGE };
  }

  const cwd = options.cwd ?? process.cwd();
  const repoRoot = findRepoRoot(cwd);
  if (repoRoot === undefined) {
    return {
      exitCode: 1,
      message: `${cwd}: no .interlock directory found in this directory or any parent; expected to run inside an interlock repository.`,
    };
  }

  const debriefPath = debriefFilePath(repoRoot, graph, node);
  if (!existsSync(debriefPath)) {
    return {
      exitCode: 1,
      message: `no debrief was filed for ${graph}/${node}; the session is interrupted.`,
    };
  }

  const debriefRead = await readDebriefFile(debriefPath);
  if (isErr(debriefRead)) {
    return { exitCode: 1, message: explainDebriefRefusal(debriefRead.error) };
  }

  if (debriefRead.value.kind === "legacy") {
    return {
      exitCode: 0,
      message: `${graph}/${node} is ${debriefRead.value.version}; marks require ${DEBRIEF_V2}.`,
    };
  }

  const verified = await verifyDebrief(repoRoot, debriefRead.value.debrief);
  if (isErr(verified)) {
    return { exitCode: 1, message: explainVerifyRefusal(verified.error) };
  }

  return { exitCode: 0, message: renderVerification(verified.value) };
}
