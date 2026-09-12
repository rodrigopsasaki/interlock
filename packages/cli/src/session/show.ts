import { isErr } from "@phyxiusjs/fp";
import { findRepoRoot, renderSessionColumns, sharedJournalDirectory } from "face";
import { type NodeView, nodeKey, readReplay, type SessionView } from "ledger";
import { legacyDebriefLine } from "../legacyDebriefLine.ts";
import type { CommandResult } from "../main.ts";

function sessionOverrideFrom(args: readonly string[]): string | undefined {
  const flagIndex = args.indexOf("--session");
  return flagIndex === -1 ? undefined : args[flagIndex + 1];
}

function hasBecauseFlag(args: readonly string[]): boolean {
  return args.includes("--because");
}

async function renderSessionView(
  repoRoot: string,
  graph: string,
  node: string,
  view: SessionView,
  nodeView: NodeView | undefined,
  isLatestSession: boolean,
  printBecause: boolean,
): Promise<string> {
  const legacyLine = await legacyDebriefLine(
    repoRoot,
    graph,
    node,
    isLatestSession && view.debrief === undefined,
  );
  return renderSessionColumns({
    graph,
    node,
    view,
    nodeView,
    legacyLine,
    printBecause,
  });
}

export async function runSessionShow(
  args: readonly string[],
  options: { readonly cwd?: string } = {},
): Promise<CommandResult> {
  const [graph, node] = args;
  if (graph === undefined || node === undefined) {
    return {
      exitCode: 1,
      message:
        'interlock session show: expected a graph id and a node id, e.g. "interlock session show 0001-bootstrap verifier-hunks".',
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

  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return {
      exitCode: 1,
      message: `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`,
    };
  }
  const projection = replayed.value;
  const nodeView = projection.nodes.get(nodeKey({ graph, id: node }));
  const nodeSessions = [...projection.sessions.values()].filter(
    (session) => session.node.graph === graph && session.node.id === node,
  );
  const latest = nodeSessions[nodeSessions.length - 1];

  const requestedSessionId = sessionOverrideFrom(args);
  if (requestedSessionId !== undefined) {
    const requested = nodeSessions.find((session) => session.session === requestedSessionId);
    if (requested === undefined) {
      return {
        exitCode: 1,
        message: `${graph}/${node}: no session "${requestedSessionId}" recorded for this node.`,
      };
    }
    const message = await renderSessionView(
      repoRoot,
      graph,
      node,
      requested,
      nodeView,
      requested.session === latest?.session,
      hasBecauseFlag(args),
    );
    return { exitCode: 0, message };
  }

  if (latest === undefined) {
    return {
      exitCode: 0,
      message: `${graph}/${node}: no session recorded for this node.`,
    };
  }
  const message = await renderSessionView(
    repoRoot,
    graph,
    node,
    latest,
    nodeView,
    true,
    hasBecauseFlag(args),
  );
  return { exitCode: 0, message };
}
