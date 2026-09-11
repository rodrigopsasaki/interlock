import type { Clock } from "@phyxiusjs/clock";
import type { AppendsEvents } from "./lease.ts";

export function recordingNarrate(
  ledger: AppendsEvents,
  clock: Clock,
  session: string,
  narrate: (line: string) => void,
): (line: string) => void {
  return (line: string) => {
    ledger.append({
      kind: "session-narrated",
      session,
      at: clock.now().wallMs,
      line,
    });
    narrate(line);
  };
}
