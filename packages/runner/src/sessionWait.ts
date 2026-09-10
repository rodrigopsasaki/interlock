import type { Clock, MonoMs } from "@phyxiusjs/clock";
import { elapsedSince, hasPassed } from "@phyxiusjs/clock";
import { err, isErr, type Result } from "@phyxiusjs/fp";
import { lastNonEmptyLine } from "./sessionScreen.ts";
import {
  explainRuntimeRefusal,
  type Agent,
  type AgentStatus,
  type Runtime,
  type RuntimeRefusal,
} from "./runtime.ts";

const AFTER_BLOCKED: readonly AgentStatus[] = ["working", "idle", "done"];
const AFTER_WORKING: readonly AgentStatus[] = ["idle", "blocked", "done"];

// After the prompt is taken, blocked is a person's turn, not the session's end: the loop keeps
// waiting through it, narrating the pane to answer and the agent going back to work, until the
// agent settles on idle or done, or the run's own deadline (set once by the caller, never reset
// by a blocked/working transition) is spent.
export async function waitForSession(
  runtime: Runtime,
  agent: Agent,
  clock: Clock,
  deadline: MonoMs,
  narrate: (line: string) => void,
): Promise<Result<AgentStatus, RuntimeRefusal>> {
  let until = AFTER_WORKING;
  let lastStatus: AgentStatus = "unknown";

  for (;;) {
    const now = clock.now().monoMs;
    if (hasPassed(now, deadline)) {
      return err({ kind: "timeout", until, timeoutMs: 0, status: lastStatus });
    }

    const remaining = elapsedSince(deadline, now);
    const waited = await runtime.waitUntil(agent, until, remaining);
    if (isErr(waited)) return waited;
    lastStatus = waited.value;

    if (waited.value === "blocked") {
      const screen = await runtime.read(agent);
      const summary = isErr(screen)
        ? `(screen unreadable: ${explainRuntimeRefusal(screen.error)})`
        : (lastNonEmptyLine(screen.value) ?? "(no output)");
      narrate(`agent blocked; answer in pane ${agent.pane.id}: ${summary}`);
      until = AFTER_BLOCKED;
      continue;
    }

    if (waited.value === "working") {
      narrate("agent working");
      until = AFTER_WORKING;
      continue;
    }

    return waited;
  }
}
