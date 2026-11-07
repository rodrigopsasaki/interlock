import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import type { CandidateReading, LedgerProjection, ProviderHeadroom } from "ledger";
import { readProviderHeadroom } from "./headroom/adapter.ts";
import type { MergedRuntimes, ResolvedRuntime } from "./runtimeCatalogue.ts";
import { type RuntimeSelectionRefusal, selectRuntime } from "./runtimeSelection.ts";

export interface RoutingOptions {
  readonly providerOrder?: readonly string[];
  readonly lastResort?: string;
  readonly readHeadroom?: (kind: string) => Promise<ProviderHeadroom>;
}

interface Candidate {
  readonly runtime: ResolvedRuntime;
  readonly provider: string;
  readonly headroom: ProviderHeadroom;
}

function roundRobin(
  candidates: readonly Candidate[],
  ledger: LedgerProjection,
  order: readonly string[],
): Candidate | undefined {
  const lastAttempt = new Map<string, number>();
  let ordinal = 0;
  for (const session of ledger.sessions.values()) {
    ordinal += 1;
    if (session.runtime !== "unknown" && session.runtime.provider !== undefined)
      lastAttempt.set(session.runtime.provider, ordinal);
  }
  const rank = (provider: string): number => {
    const index = order.indexOf(provider);
    return index === -1 ? order.length : index;
  };
  return [...candidates].sort((left, right) => {
    const a = lastAttempt.get(left.provider) ?? -1;
    const b = lastAttempt.get(right.provider) ?? -1;
    return a - b || rank(left.provider) - rank(right.provider);
  })[0];
}

export async function routeRuntime(
  merged: MergedRuntimes,
  requested: string | undefined,
  ledger: LedgerProjection,
  options: RoutingOptions = {},
): Promise<Result<ResolvedRuntime, RuntimeSelectionRefusal>> {
  if (requested !== undefined) {
    const selected = selectRuntime(merged, requested);
    return isErr(selected) ? selected : ok({ ...selected.value, chosenBy: { kind: "explicit" } });
  }
  const candidates: Candidate[] = [];
  const read = options.readHeadroom ?? readProviderHeadroom;
  for (const runtime of merged.runtimes.values()) {
    if (runtime.routable !== true || runtime.provider === undefined) continue;
    candidates.push({ runtime, provider: runtime.provider, headroom: await read(runtime.kind) });
  }
  if (candidates.length === 0) {
    const selected = selectRuntime(merged, undefined);
    return isErr(selected)
      ? selected
      : ok({
          ...selected.value,
          chosenBy: {
            kind: "fallback",
            because: `no routable profile; used ${selected.value.name === merged.defaultRuntime ? `default_runtime "${selected.value.name}"` : "the legacy default resolution"}`,
          },
        });
  }
  const readings: readonly CandidateReading[] = candidates.map(({ provider, headroom }) => ({
    provider,
    headroom,
  }));
  const available = candidates.filter(
    ({ headroom }) =>
      headroom.rateLimited !== true && (headroom.state === "unknown" || headroom.fraction > 0),
  );
  const lastResort = options.lastResort ?? "anthropic";
  const ordinary = available.filter(({ provider }) => provider !== lastResort);
  const pool = ordinary.length > 0 ? ordinary : available;
  if (pool.length === 0)
    return err({ kind: "providers-exhausted", known: candidates.map(({ provider }) => provider) });
  const highest = Math.max(
    ...pool.flatMap(({ headroom }) => (headroom.state === "known" ? [headroom.fraction] : [])),
  );
  const tied = Number.isFinite(highest)
    ? pool.filter(({ headroom }) => headroom.state === "known" && headroom.fraction === highest)
    : pool;
  const selected = roundRobin(tied, ledger, options.providerOrder ?? []);
  if (selected === undefined)
    return err({ kind: "providers-exhausted", known: candidates.map(({ provider }) => provider) });
  const because =
    ordinary.length === 0
      ? candidates.length === 1
        ? "the last-resort provider is the sole routable provider"
        : "every other routable provider is known exhausted"
      : Number.isFinite(highest)
        ? "highest known allowance fraction; ledger round-robin breaks ties"
        : "all available non-last-resort headroom is unknown; ledger round-robin";
  return ok({
    ...selected.runtime,
    chosenBy: {
      kind: ordinary.length === 0 ? "last-resort" : "routed",
      because,
      candidates: readings,
    },
  });
}
