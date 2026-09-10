import { createSystemClock } from "@phyxiusjs/clock";
import { isErr } from "@phyxiusjs/fp";
import {
  currentCommitSha,
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  journalDirectory,
  loadGraphDocument,
} from "face";
import {
  createLedger,
  createReceipt,
  derivation,
  duration,
  gate,
  nodeKey,
  proposeGateMove,
  spend,
  type Node,
} from "ledger";
import type { CommandResult } from "../main.ts";

function parseFlag(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export async function runGraphApprove(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [id] = args;
  if (id === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock graph approve: expected a graph id, e.g. "interlock graph approve 0001-bootstrap --by <who> --because <why>".',
    };
  }

  const because = parseFlag(args, "--because");
  if (because === undefined) {
    return {
      exitCode: 1,
      message:
        "interlock graph approve: refuses without --because; every approval records why.",
    };
  }

  const by = parseFlag(args, "--by");
  if (by === undefined) {
    return {
      exitCode: 1,
      message:
        "interlock graph approve: refuses without --by; every approval records who.",
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
  const clock = createSystemClock();
  const opened = await createLedger({ clock, directory: journal });
  if (isErr(opened)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${opened.error.line} has shape tag "${opened.error.tag}", which this build does not recognize.`,
    };
  }
  const ledger = opened.value;

  const node: Node = { graph: id, id };
  if (ledger.projection().nodes.get(nodeKey(node)) === undefined) {
    ledger.append({ kind: "node-created", node });
  }

  const declaredGates = document.value.gates.map((declared) => declared.id);
  const current =
    ledger.projection().nodes.get(nodeKey(node))?.gates.get("approved") ??
    gate.pending();
  const commitSha = currentCommitSha(repoRoot);
  const receipt = await createReceipt(
    [path],
    "approved",
    commitSha,
    spend.none(),
    duration.unknown(),
    derivation.human(by),
    { because },
  );

  const moved = proposeGateMove(
    declaredGates,
    "approved",
    current,
    gate.satisfied(receipt),
  );
  if (isErr(moved)) {
    await ledger.close();
    const refusal = moved.error;
    const message =
      refusal.kind === "undeclared-gate"
        ? `${path}: gate "approved" is not declared on this graph; declared gates are ${refusal.declared.join(", ") || "(none)"}.`
        : `${path}: gate "approved" cannot move from ${refusal.from}, which is terminal.`;
    return { exitCode: 1, message };
  }

  ledger.append({
    kind: "gate-moved",
    node,
    gate: "approved",
    to: moved.value,
  });
  await ledger.close();

  return { exitCode: 0, message: `${id}: approved (receipt ${receipt.id}).` };
}
