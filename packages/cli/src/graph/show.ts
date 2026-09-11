import { relative } from "node:path";
import { isErr, ok } from "@phyxiusjs/fp";
import {
  explainGraphRefusal,
  findRepoRoot,
  graphFilePath,
  sharedJournalDirectory,
  loadGraphDocument,
  positionOf,
  renderPosition,
  type AgentStatus,
} from "face";
import {
  explainScopeRefusal,
  readReplay,
  receiptId,
  type SessionView,
} from "ledger";
import { createHerdrRuntime, type Runtime } from "runner";
import type { CommandResult } from "../main.ts";

function liveSessions(
  graphId: string,
  sessions: ReadonlyMap<string, SessionView>,
): readonly SessionView[] {
  return [...sessions.values()].filter(
    (session) =>
      session.node.graph === graphId &&
      session.lease !== undefined &&
      !session.leaseExpired,
  );
}

async function resolveAgentStatuses(
  graphId: string,
  sessions: readonly SessionView[],
  injectedRuntime: Runtime | undefined,
): Promise<ReadonlyMap<string, AgentStatus>> {
  const statuses = new Map<string, AgentStatus>();
  if (sessions.length === 0) return statuses;

  const runtime =
    injectedRuntime === undefined
      ? await createHerdrRuntime()
      : ok(injectedRuntime);
  if (isErr(runtime)) return statuses;

  for (const session of sessions) {
    const status = await runtime.value.reportedAgentStatus?.({
      graph: graphId,
      node: session.node.id,
      session: session.session,
    });
    if (status !== undefined && !isErr(status) && status.value !== undefined) {
      statuses.set(session.session, status.value);
    }
  }
  return statuses;
}

export async function runGraphShow(
  args: readonly string[],
  options: { readonly cwd?: string; readonly runtime?: Runtime } = {},
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

  const journal = sharedJournalDirectory(repoRoot);
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

  const statuses = await resolveAgentStatuses(
    id,
    liveSessions(id, replayed.value.sessions),
    options.runtime,
  );

  const position = positionOf(
    document.value,
    replayed.value,
    contentHash.value,
    (session) => statuses.get(session),
  );

  return {
    exitCode: 0,
    message: args.includes("--json")
      ? JSON.stringify(position, null, 2)
      : renderPosition(position),
  };
}
