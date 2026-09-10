import { relative } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import {
  briefFilePath,
  explainBriefRefusal,
  readBriefFile,
  type BriefRead,
} from "debrief";
import { findRepoRoot } from "face";
import type { CommandResult } from "../main.ts";

const USAGE =
  'interlock brief validate: expected a graph id and a node id, e.g. "interlock brief validate 0002-shapes brief-shape", or "interlock brief validate --file <path>".';

function describeBriefRead(read: BriefRead): string {
  return read.kind === "v1"
    ? "valid as brief@v1."
    : "valid as brief@v0; the runner requires brief@v1.";
}

async function validateOneFile(path: string): Promise<CommandResult> {
  const read = await readBriefFile(path);
  if (isErr(read))
    return { exitCode: 1, message: explainBriefRefusal(read.error) };
  return { exitCode: 0, message: `${path}: ${describeBriefRead(read.value)}` };
}

export async function validateBrief(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  if (args[0] === "--file") {
    const path = args[1];
    if (path === undefined) {
      return {
        exitCode: 1,
        message:
          'interlock brief validate --file: expected a path, e.g. "interlock brief validate --file .interlock/sessions/0002-shapes/brief-shape/brief.md".',
      };
    }
    return validateOneFile(path);
  }

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

  const path = briefFilePath(repoRoot, graph, node);
  const read = await readBriefFile(path);
  if (isErr(read))
    return { exitCode: 1, message: explainBriefRefusal(read.error) };
  return {
    exitCode: 0,
    message: `${relative(repoRoot, path)}: ${describeBriefRead(read.value)}`,
  };
}
