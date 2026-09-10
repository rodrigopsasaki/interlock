import type { Clock, Millis, TimerHandle } from "@phyxiusjs/clock";
import { ms } from "@phyxiusjs/clock";
import type { LedgerEvent, Node } from "ledger";

export interface LeaseHandle {
  readonly expiry: number;
  stop(): void;
}

export interface AppendsEvents {
  append(event: LedgerEvent): void;
}

const HEARTBEATS_PER_LEASE = 3;

function heartbeatInterval(leaseMs: number): Millis {
  return ms(Math.max(1, Math.floor(leaseMs / HEARTBEATS_PER_LEASE)));
}

export function takeLease(
  ledger: AppendsEvents,
  clock: Clock,
  node: Node,
  session: string,
  leaseMs: number,
): LeaseHandle {
  const expiry = clock.now().wallMs + leaseMs;
  ledger.append({ kind: "lease-taken", node, session, expiry });

  const timer: TimerHandle = clock.interval(heartbeatInterval(leaseMs), () => {
    ledger.append({
      kind: "lease-renewed",
      node,
      session,
      expiry: clock.now().wallMs + leaseMs,
    });
  });

  return { expiry, stop: () => timer.cancel() };
}
