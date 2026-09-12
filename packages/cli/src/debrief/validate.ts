import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import {
  DEBRIEF_V2,
  type DebriefRead,
  debriefFilePath,
  explainDebriefRefusal,
  explainNotesRefusal,
  NOTES_V0,
  notesFilePath,
  readDebriefFile,
  readNotesFile,
} from "debrief";
import { findRepoRoot } from "face";
import { shapeTag } from "ledger";
import { parse as parseYaml } from "yaml";
import type { CommandResult } from "../main.ts";

const USAGE =
  'interlock debrief validate: expected a graph id and a node id, e.g. "interlock debrief validate 0001-bootstrap debrief-schema", or "interlock debrief validate --file <path>".';

export function describeDebriefRead(read: DebriefRead): string {
  if (read.kind === "v2") return `valid as ${DEBRIEF_V2}.`;

  const extra = [...read.missingTopLevel];
  if (read.decisionsMissingBecause > 0) {
    extra.push(`"because" on ${read.decisionsMissingBecause} of ${read.decisionsTotal} decisions`);
  }
  const detail =
    extra.length > 0 ? ` ${DEBRIEF_V2} would additionally require: ${extra.join(", ")}.` : "";
  return `valid as ${read.version}; not ingested.${detail}`;
}

async function peekShapeTag(path: string): Promise<string | undefined> {
  try {
    return shapeTag(parseYaml(await readFile(path, "utf-8")));
  } catch {
    return undefined;
  }
}

async function validateOneFile(path: string): Promise<CommandResult> {
  const tag = await peekShapeTag(path);
  if (tag !== undefined && tag.startsWith("notes@")) {
    const notesRead = await readNotesFile(path);
    if (isErr(notesRead)) return { exitCode: 1, message: explainNotesRefusal(notesRead.error) };
    return { exitCode: 0, message: `${path}: valid as ${NOTES_V0}.` };
  }

  const debriefRead = await readDebriefFile(path);
  if (isErr(debriefRead)) return { exitCode: 1, message: explainDebriefRefusal(debriefRead.error) };
  return {
    exitCode: 0,
    message: `${path}: ${describeDebriefRead(debriefRead.value)}`,
  };
}

export async function validateDebrief(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  if (args[0] === "--file") {
    const path = args[1];
    if (path === undefined) {
      return {
        exitCode: 1,
        message:
          'interlock debrief validate --file: expected a path, e.g. "interlock debrief validate --file .interlock/sessions/0001-bootstrap/debrief-schema/debrief.yaml".',
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

  const notesPath = notesFilePath(repoRoot, graph, node);
  const notesRead = await readNotesFile(notesPath);
  if (isErr(notesRead) && notesRead.error.kind !== "missing-file") {
    return { exitCode: 1, message: explainNotesRefusal(notesRead.error) };
  }
  const relativeNotesPath = relative(repoRoot, notesPath);
  const notesMessage = isErr(notesRead)
    ? `${relativeNotesPath}: no notes were appended.`
    : `${relativeNotesPath}: valid as ${NOTES_V0}.`;

  return {
    exitCode: 0,
    message: [
      `${relative(repoRoot, debriefPath)}: ${describeDebriefRead(debriefRead.value)}`,
      notesMessage,
    ].join("\n"),
  };
}
