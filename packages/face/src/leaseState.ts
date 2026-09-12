import { leaseIsLive, type SessionView } from "ledger";

export type LeaseState =
  | { readonly kind: "none" }
  | { readonly kind: "live" }
  | { readonly kind: "expired"; readonly agoMs: number };

export function leaseStateOf(session: SessionView, nowWallMs: number): LeaseState {
  if (session.lease === undefined) return { kind: "none" };
  if (leaseIsLive(session, nowWallMs)) return { kind: "live" };
  return {
    kind: "expired",
    agoMs: Math.max(0, nowWallMs - session.lease.expiry),
  };
}

export function renderAgo(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
