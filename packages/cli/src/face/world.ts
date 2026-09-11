import { relative } from "node:path";
import { isErr, isOk, ok, type Result } from "@phyxiusjs/fp";
import {
  graphFilePath,
  listGraphIds,
  loadGraphDocument,
  plansEntryOf,
  positionOf,
  renderSessionColumns,
  sharedJournalDirectory,
  type FaceWorld,
  type GraphRefusal,
} from "face";
import { emptyProjection, nodeKey, readReplay, receiptId } from "ledger";
import type { Runtime } from "runner";
import { liveSessionsOf, resolveAgentStatuses } from "../herdrStatus.ts";
import { legacyDebriefLine } from "../legacyDebriefLine.ts";

async function contentHashOf(
  repoRoot: string,
  path: string,
): Promise<string | undefined> {
  const hashed = await receiptId(
    repoRoot,
    [relative(repoRoot, path)],
    "approved",
  );
  return isOk(hashed) ? hashed.value : undefined;
}

export async function buildPlansWorld(
  repoRoot: string,
  runtime: Runtime | undefined,
): Promise<FaceWorld> {
  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  const projection = isErr(replayed) ? emptyProjection() : replayed.value;

  const graphIds = await listGraphIds(repoRoot);
  const plans = [];
  for (const graphId of graphIds) {
    const path = graphFilePath(repoRoot, graphId);
    const document = await loadGraphDocument(path);
    if (isErr(document)) continue;
    const contentHash = await contentHashOf(repoRoot, path);
    if (contentHash === undefined) continue;
    const statuses = await resolveAgentStatuses(
      graphId,
      liveSessionsOf(graphId, projection.sessions),
      runtime,
    );
    const position = positionOf(
      document.value,
      projection,
      contentHash,
      (session) => statuses.get(session),
    );
    plans.push(plansEntryOf(position));
  }
  return { plans };
}

export async function buildGraphWorld(
  repoRoot: string,
  graphId: string,
  runtime: Runtime | undefined,
): Promise<Result<FaceWorld, GraphRefusal>> {
  const path = graphFilePath(repoRoot, graphId);
  const document = await loadGraphDocument(path);
  if (isErr(document)) return document;

  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  const projection = isErr(replayed) ? emptyProjection() : replayed.value;

  const contentHash = (await contentHashOf(repoRoot, path)) ?? "";
  const statuses = await resolveAgentStatuses(
    graphId,
    liveSessionsOf(graphId, projection.sessions),
    runtime,
  );
  const position = positionOf(
    document.value,
    projection,
    contentHash,
    (session) => statuses.get(session),
  );
  return ok({ plans: [], position });
}

export async function buildSessionText(
  repoRoot: string,
  graph: string,
  node: string,
  sessionId: string,
): Promise<string> {
  const journal = sharedJournalDirectory(repoRoot);
  const replayed = await readReplay(journal);
  if (isErr(replayed)) {
    return `${journal}: line ${replayed.error.line} has shape tag "${replayed.error.tag}", which this build does not recognize.`;
  }
  const projection = replayed.value;
  const view = projection.sessions.get(sessionId);
  if (view === undefined) {
    return `${graph}/${node}: no session "${sessionId}" recorded for this node.`;
  }
  const nodeView = projection.nodes.get(nodeKey({ graph, id: node }));
  const nodeSessions = [...projection.sessions.values()].filter(
    (session) => session.node.graph === graph && session.node.id === node,
  );
  const latest = nodeSessions[nodeSessions.length - 1];
  const isLatestSession = latest?.session === sessionId;

  const legacyLine =
    isLatestSession && view.debrief === undefined
      ? await legacyDebriefLine(repoRoot, graph, node, true)
      : undefined;

  return renderSessionColumns({
    graph,
    node,
    view,
    nodeView,
    legacyLine,
    printBecause: true,
  });
}
