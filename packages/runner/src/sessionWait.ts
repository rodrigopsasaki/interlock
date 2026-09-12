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

export interface UnfinishedWork {
  readonly uncommittedPaths: number;
  readonly debriefMissing: boolean;
}

function armGrace(
  now: MonoMs,
  deadline: MonoMs,
  answerGraceMs: number,
  settled: AgentStatus,
): AnswerGrace {
  const candidate = deadlineFrom(now, ms(answerGraceMs));
  return {
    deadline: hasPassed(candidate, deadline) ? deadline : candidate,
    settled,
  };
}

function describeUnfinishedWork(work: UnfinishedWork): string {
  const parts: string[] = [];
  if (work.uncommittedPaths > 0) {
    parts.push(
      `${work.uncommittedPaths} uncommitted path${work.uncommittedPaths === 1 ? "" : "s"}`,
    );
  }
  if (work.debriefMissing) parts.push("no debrief");
  return parts.join(" and ");
}

export async function waitForSession(
  runtime: Runtime,
  agent: Agent,
  clock: Clock,
  deadline: MonoMs,
  runTimeoutMs: number,
  answerGraceMs: number,
  narrate: (line: string) => void,
  readUnfinishedWork: () => UnfinishedWork | undefined,
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

    if (grace !== undefined) {
      until = AFTER_SETTLED;
      continue;
    }

    if (seenBlocked) {
      narrate(
        `agent settled after a person's turn; judging in ${Math.round(answerGraceMs / 1000)}s unless it resumes`,
      );
      grace = armGrace(now, deadline, answerGraceMs, waited.value);
      until = AFTER_SETTLED;
      continue;
    }

    const unfinished = readUnfinishedWork();
    if (unfinished !== undefined) {
      narrate(
        `agent settled with ${describeUnfinishedWork(unfinished)}; judging in ${Math.round(answerGraceMs / 1000)}s unless it resumes`,
      );
      grace = armGrace(now, deadline, answerGraceMs, waited.value);
      until = AFTER_SETTLED;
      continue;
    }

    return waited;
  }
}
