import { isErr, ok } from "@phyxiusjs/fp";
import type { AgentStatus } from "face";
import type { SessionView } from "ledger";
import { createHerdrRuntime, type Runtime } from "runner";

export function liveSessionsOf(
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

export async function resolveAgentStatuses(
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
