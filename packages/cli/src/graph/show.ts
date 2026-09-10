import { relative } from "node:path";
import { isErr } from "@phyxiusjs/fp";
import {
  computePosition,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  journalDirectory,
  loadGraphDocument,
  renderPosition,
} from "face";
import { explainScopeRefusal, readReplay, receiptId } from "ledger";
import type { CommandResult } from "../main.ts";

export async function runGraphShow(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [id] = args;
  if (id === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock graph show: expected a graph id, e.g. "interlock graph show 0001-bootstrap".',
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

  const path = graphFilePath(repoRoot, id);
  const document = await loadGraphDocument(path);
  if (isErr(document)) {
    return { exitCode: 1, message: explainGraphRefusal(document.error) };
  }

  const journal = journalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
    };
  }

  const contentHash = await receiptId(
    repoRoot,
    [relative(repoRoot, path)],
    "approved",
  );
  if (isErr(contentHash)) {
    return { exitCode: 1, message: explainScopeRefusal(contentHash.error) };
  }

  const position = computePosition(
    document.value,
    replayed.value,
    contentHash.value,
  );
  return { exitCode: 0, message: renderPosition(position) };
}
