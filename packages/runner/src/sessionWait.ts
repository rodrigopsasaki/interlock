import type { Clock, MonoMs } from "@phyxiusjs/clock";
import { deadlineFrom, elapsedSince, hasPassed, ms } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
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
const AFTER_SETTLED: readonly AgentStatus[] = ["working"];

interface AnswerGrace {
  readonly deadline: MonoMs;
  readonly settled: AgentStatus;
}

export async function waitForSession(
  runtime: Runtime,
  agent: Agent,
  clock: Clock,
  deadline: MonoMs,
  runTimeoutMs: number,
  answerGraceMs: number,
  narrate: (line: string) => void,
): Promise<Result<AgentStatus, RuntimeRefusal>> {
  let until = AFTER_WORKING;
  let lastStatus: AgentStatus = "unknown";
  let seenBlocked = false;
  let grace: AnswerGrace | undefined;

  for (;;) {
    const now = clock.now().monoMs;
    const boundDeadline = grace?.deadline ?? deadline;
    if (hasPassed(now, boundDeadline)) {
      if (grace !== undefined) return ok(grace.settled);
      return err({
        kind: "timeout",
        until,
        timeoutMs: runTimeoutMs,
        status: lastStatus,
      });
    }

    const remaining = elapsedSince(boundDeadline, now);
    const waited = await runtime.waitUntil(agent, until, remaining);
    if (isErr(waited)) {
      if (grace !== undefined && waited.error.kind === "timeout") {
        return ok(grace.settled);
      }
      return waited;
    }
    lastStatus = waited.value;

    if (waited.value === "blocked") {
      const screen = await runtime.read(agent);
      const summary = isErr(screen)
        ? `(screen unreadable: ${explainRuntimeRefusal(screen.error)})`
        : (lastNonEmptyLine(screen.value) ?? "(no output)");
      narrate(`agent blocked; answer in pane ${agent.pane.id}: ${summary}`);
      until = AFTER_BLOCKED;
      seenBlocked = true;
      grace = undefined;
      continue;
    }

    if (waited.value === "working") {
      narrate("agent working");
      until = AFTER_WORKING;
      grace = undefined;
      continue;
    }

    if (seenBlocked) {
      const candidate = deadlineFrom(now, ms(answerGraceMs));
      const graceDeadline = hasPassed(candidate, deadline)
        ? deadline
        : candidate;
      narrate(
        `agent settled after a person's turn; judging in ${Math.round(answerGraceMs / 1000)}s unless it resumes`,
      );
      grace = { deadline: graceDeadline, settled: waited.value };
      until = AFTER_SETTLED;
      continue;
    }

    return waited;
  }
}
