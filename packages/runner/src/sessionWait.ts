import type { Clock, MonoMs } from "@phyxiusjs/clock";
import { deadlineFrom, elapsedSince, hasPassed, ms } from "@phyxiusjs/clock";
import { err, isErr, ok, type Result } from "@phyxiusjs/fp";
import {
  type Agent,
  type AgentObservation,
  type AgentStatus,
  describeLiveWork,
  explainRuntimeRefusal,
  type LiveWork,
  type Runtime,
  type RuntimeRefusal,
} from "./runtime.ts";
import { lastNonEmptyLine } from "./sessionScreen.ts";

const AFTER_BLOCKED: readonly AgentStatus[] = ["working", "idle", "done"];
const AFTER_WORKING: readonly AgentStatus[] = ["idle", "blocked", "done"];
const AFTER_SETTLED: readonly AgentStatus[] = ["working"];
const WHILE_HELD: readonly AgentStatus[] = ["working", "blocked"];
const SETTLED: readonly AgentStatus[] = ["idle", "done"];
export const LIVE_WORK_OBSERVE_MS = 5_000;

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

interface Held {
  readonly settled: AgentStatus;
  readonly work: LiveWork;
}

type Settlement =
  | { readonly kind: "settled"; readonly status: AgentStatus }
  | { readonly kind: "resumed" }
  | { readonly kind: "held"; readonly held: Held };

async function settle(
  settled: AgentStatus,
  observe: () => Promise<AgentObservation>,
): Promise<Settlement> {
  const observation = await observe();
  if (observation.agentStatus === "working" || observation.agentStatus === "blocked") {
    return { kind: "resumed" };
  }
  const work = await observation.liveWork();
  if (!SETTLED.includes(observation.agentStatus)) {
    return {
      kind: "held",
      held: {
        settled,
        work:
          work.state === "none"
            ? {
                state: "unknown",
                because: `the runtime's observation shows the agent ${observation.agentStatus}`,
              }
            : work,
      },
    };
  }
  return work.state === "none"
    ? { kind: "settled", status: settled }
    : { kind: "held", held: { settled, work } };
}

export interface WaitOptions {
  readonly alreadySettled?: AgentStatus;
  readonly observeEveryMs?: number;
}

export async function waitForSession(
  runtime: Runtime,
  agent: Agent,
  observe: () => Promise<AgentObservation>,
  clock: Clock,
  deadline: MonoMs,
  runTimeoutMs: number,
  answerGraceMs: number,
  narrate: (line: string) => void,
  readUnfinishedWork: () => UnfinishedWork | undefined,
  recordBlocked: () => Promise<void> = () => Promise.resolve(),
  options: WaitOptions = {},
): Promise<Result<AgentStatus, RuntimeRefusal>> {
  const observeEveryMs = options.observeEveryMs ?? LIVE_WORK_OBSERVE_MS;
  let until = AFTER_WORKING;
  let lastStatus: AgentStatus = options.alreadySettled ?? "unknown";
  let seenBlocked = false;
  let grace: AnswerGrace | undefined;
  let held: Held | undefined;
  let candidate: AgentStatus | undefined = options.alreadySettled;

  const hold = (next: Held): void => {
    if (held === undefined || describeLiveWork(held.work) !== describeLiveWork(next.work)) {
      narrate(
        `agent ${next.settled} but its work is not shown finished (${describeLiveWork(next.work)}); observing again`,
      );
    }
    held = next;
  };

  for (;;) {
    if (candidate !== undefined) {
      const settlement = await settle(candidate, observe);
      candidate = undefined;
      if (settlement.kind === "settled") return ok(settlement.status);
      if (settlement.kind === "resumed") {
        held = undefined;
        until = AFTER_WORKING;
      } else {
        hold(settlement.held);
      }
      continue;
    }

    const now = clock.now().monoMs;
    if (held === undefined && grace !== undefined && hasPassed(now, grace.deadline)) {
      candidate = grace.settled;
      grace = undefined;
      continue;
    }
    if (hasPassed(now, deadline)) {
      return err({
        kind: "timeout",
        until: held === undefined ? until : WHILE_HELD,
        timeoutMs: runTimeoutMs,
        status: lastStatus,
        ...(held === undefined ? {} : { liveWork: held.work }),
      });
    }

    const observeBy = deadlineFrom(now, ms(observeEveryMs));
    const boundDeadline =
      held !== undefined
        ? hasPassed(observeBy, deadline)
          ? deadline
          : observeBy
        : (grace?.deadline ?? deadline);
    const remaining = elapsedSince(boundDeadline, now);
    const waited = await runtime.waitUntil(
      agent,
      held === undefined ? until : WHILE_HELD,
      remaining,
    );
    if (isErr(waited)) {
      if (waited.error.kind !== "timeout") return waited;
      if (held !== undefined) {
        candidate = held.settled;
        continue;
      }
      if (grace !== undefined) {
        candidate = grace.settled;
        grace = undefined;
        continue;
      }
      return waited;
    }
    const settledAt = clock.now().monoMs;
    lastStatus = waited.value;

    if (waited.value === "blocked") {
      await recordBlocked();
      const screen = await runtime.read(agent);
      const summary = isErr(screen)
        ? `(screen unreadable: ${explainRuntimeRefusal(screen.error)})`
        : (lastNonEmptyLine(screen.value) ?? "(no output)");
      narrate(`agent blocked; answer in pane ${agent.pane.id}: ${summary}`);
      until = AFTER_BLOCKED;
      seenBlocked = true;
      grace = undefined;
      held = undefined;
      continue;
    }

    if (waited.value === "working") {
      narrate("agent working");
      until = AFTER_WORKING;
      grace = undefined;
      held = undefined;
      continue;
    }

    if (held !== undefined) {
      candidate = held.settled;
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
      grace = armGrace(settledAt, deadline, answerGraceMs, waited.value);
      until = AFTER_SETTLED;
      continue;
    }

    const unfinished = readUnfinishedWork();
    if (unfinished !== undefined) {
      narrate(
        `agent settled with ${describeUnfinishedWork(unfinished)}; judging in ${Math.round(answerGraceMs / 1000)}s unless it resumes`,
      );
      grace = armGrace(settledAt, deadline, answerGraceMs, waited.value);
      until = AFTER_SETTLED;
      continue;
    }

    candidate = waited.value;
  }
}
