import { isErr } from "@phyxiusjs/fp";
import type { AgentStatus } from "face";
import { leaseIsLive, type SessionView } from "ledger";
import { createHerdrRuntime, type Runtime } from "runner";

export function liveSessionsOf(
  graphId: string,
  sessions: ReadonlyMap<string, SessionView>,
  nowWallMs: number,
): readonly SessionView[] {
  return [...sessions.values()].filter(
    (session) => session.node.graph === graphId && leaseIsLive(session, nowWallMs),
  );
}

export async function statusesFrom(
  graphId: string,
  sessions: readonly SessionView[],
  runtime: Runtime,
): Promise<ReadonlyMap<string, AgentStatus>> {
  const reported = await Promise.all(
    sessions.map(async (session): Promise<[string, AgentStatus][]> => {
      const status = await runtime.reportedAgentStatus?.({
        graph: graphId,
        node: session.node.id,
        session: session.session,
      });
      return status === undefined || isErr(status) || status.value === undefined
        ? []
        : [[session.session, status.value]];
    }),
  );
  return new Map(reported.flat());
}

export function sharedRuntime(
  injectedRuntime: Runtime | undefined,
): () => Promise<Runtime | undefined> {
  let created: Promise<Runtime | undefined> | undefined;
  return () => {
    created ??=
      injectedRuntime === undefined
        ? createHerdrRuntime().then((runtime) => (isErr(runtime) ? undefined : runtime.value))
        : Promise.resolve(injectedRuntime);
    return created;
  };
}

export async function resolveAgentStatuses(
  graphId: string,
  sessions: readonly SessionView[],
  injectedRuntime: Runtime | undefined,
): Promise<ReadonlyMap<string, AgentStatus>> {
  if (sessions.length === 0) return new Map();
  const runtime = await sharedRuntime(injectedRuntime)();
  return runtime === undefined ? new Map() : statusesFrom(graphId, sessions, runtime);
}
