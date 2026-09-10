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

// Heartbeat at a third of the lease's own length (brief: "the lease bounds silence, not work").
export function takeLease(
  ledger: AppendsEvents,
  clock: Clock,
  node: Node,
  session: string,
  leaseMs: number,
): LeaseHandle {
  const expiry = clock.now().wallMs + leaseMs;
  ledger.append({ kind: "lease-taken", node, session, expiry });

  const heartbeat: Millis = ms(Math.max(1, Math.floor(leaseMs / 3)));
  const timer: TimerHandle = clock.interval(heartbeat, () => {
    ledger.append({
      kind: "lease-renewed",
      node,
      session,
      expiry: clock.now().wallMs + leaseMs,
    });
  });

  return { expiry, stop: () => timer.cancel() };
}
